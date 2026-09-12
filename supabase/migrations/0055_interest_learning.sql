-- =============================================================================
-- 0055_interest_learning.sql  ·  Interesse, das sich auch nach unten bewegt
--
-- Der Befund
-- ----------
-- Es gab schon eine Lernregel: Like mal 1.15, Skip mal 0.92. Nur ist die
-- in eine Richtung viel staerker als in die andere.
--
--     ein Like      +15 %
--     ein Skip       -8 %
--
-- Um eine Kategorie zu halbieren, braucht es ACHT Skips in Folge - und
-- ein einziges Like macht davon die Haelfte wieder wett. In der Praxis
-- waechst alles nach oben und nichts nach unten. "Wenn eine Kategorie
-- nie geliked wird, soll sie seltener kommen" war damit nicht umgesetzt,
-- auch wenn es so aussah.
--
-- Drei Aenderungen
-- ----------------
-- 1. Skip wirkt staerker: 0.92 -> 0.85. Damit halbiert sich eine
--    Kategorie nach rund vier Skips statt nach acht.
--
-- 2. "Nie geliked" wird ueberhaupt erst gemessen. Die alte Formel kennt
--    nur einzelne Ereignisse, nicht die Bilanz. Neu sind zwei Zaehler
--    (gesehen, geliked) und daraus eine Regel: wer eine Kategorie
--    zwanzigmal gesehen und kein einziges Mal geliked hat, mag sie
--    offenbar nicht - unabhaengig davon, ob er brav zu Ende gelesen hat.
--    Das ist der Fall, den du beschrieben hast, und der vorher durch
--    jedes Raster fiel.
--
-- 3. Spaetere Ereignisse wiegen weniger als fruehe. Ohne das verbiegt
--    ein einzelner schlechter Abend das Profil, das ueber Wochen
--    entstanden ist. Der Faktor wird mit wachsender Beobachtungszahl
--    zur 1 hin gezogen:
--
--        wirksam = 1 + (faktor - 1) * 20 / (20 + gesehen)
--
--    Bei 0 gesehenen Karten wirkt ein Like voll (+15 %), bei 20 noch
--    halb, bei 100 nur noch zu einem Sechstel. Das ist die uebliche
--    Daempfung ueber die Stichprobengroesse und der Grund, warum sich
--    ein eingefahrenes Profil nicht mehr umwerfen laesst, ein frisches
--    aber schnell formt.
-- =============================================================================

alter table public.user_categories
  add column if not exists seen_count  int not null default 0,
  add column if not exists liked_count int not null default 0;


-- --- Die Bilanzregel als eigene Funktion ------------------------------------
--
-- Ausgelagert, weil sie an zwei Stellen gebraucht wird: beim Verbuchen
-- der Ereignisse und beim Bauen des Feeds. Zweimal dieselbe Formel waere
-- zweimal dieselbe Formel zum Auseinanderlaufen.
create or replace function public.interest_after_balance(
  p_weight numeric,
  p_seen   int,
  p_liked  int
) returns numeric
language sql immutable set search_path = ''
as $fn$
  select case
           -- Zwanzig Karten gesehen, kein einziges Like: das ist keine
           -- Zufallsschwankung mehr. Halbieren, aber nicht ausloeschen -
           -- Geschmack aendert sich, und eine Kategorie auf 0 kaeme nie
           -- wieder vor und koennte sich nie rehabilitieren.
           -- Die schaerfere Stufe MUSS zuerst stehen. Andersherum faengt
           -- die 20er-Bedingung jeden Fall ab und die 40er ist toter
           -- Code - ein CASE prueft von oben nach unten und nimmt den
           -- ersten Treffer.
           when p_seen >= 40 and p_liked = 0 then greatest(0.10, p_weight * 0.3)
           when p_seen >= 20 and p_liked = 0 then greatest(0.15, p_weight * 0.5)
           else p_weight
         end;
$fn$;


-- --- Die Lernregel ----------------------------------------------------------
create or replace function public.apply_interest_event(
  p_user     uuid,
  p_category text,
  p_event    text
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_seen   int;
  v_liked  int;
  v_weight numeric;
  v_raw    numeric;
  v_eff    numeric;
begin
  if p_category is null then return; end if;

  insert into public.user_categories (user_id, category_id)
  values (p_user, p_category)
  on conflict (user_id, category_id) do nothing;

  select interest_weight, seen_count, liked_count
    into v_weight, v_seen, v_liked
    from public.user_categories
   where user_id = p_user and category_id = p_category;

  v_raw := case p_event when 'like' then 1.15 else 0.85 end;

  -- Daempfung ueber die Stichprobengroesse: je mehr schon beobachtet
  -- wurde, desto weniger darf ein einzelnes Ereignis verschieben.
  v_eff := 1 + (v_raw - 1) * 20.0 / (20 + v_seen);

  update public.user_categories
     set seen_count      = seen_count + 1,
         liked_count     = liked_count + case when p_event = 'like' then 1 else 0 end,
         interest_weight = least(5.0, greatest(0.1,
                             public.interest_after_balance(
                               v_weight * v_eff,
                               seen_count + 1,
                               liked_count + case when p_event = 'like' then 1 else 0 end
                             ))),
         updated_at      = now()
   where user_id = p_user and category_id = p_category;
end
$fn$;


-- =============================================================================
-- flush_events ruft jetzt die neue Regel auf
--
-- Woertlich das Original aus 0003, mit EINEM ausgetauschten Block. Alles
-- andere - Stapelgrenze, award_xp, Lesevalidierung ueber dwell_target_ms,
-- is_liked/is_skipped, cards_read_total, focus_seconds_total,
-- touch_streak und die Rueckgabeschluessel xp_awarded/cards_validated -
-- bleibt unangetastet.
-- =============================================================================

create or replace function public.flush_events(p_events jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  v_ev    jsonb;
  v_item  public.content_items;
  v_state public.user_content_state;
  v_xp    int := 0;
  v_read  int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_array_length(p_events) > 200 then
    raise exception 'batch too large';
  end if;

  for v_ev in select * from jsonb_array_elements(p_events) loop

    insert into public.content_events
      (user_id, content_id, event_type, dwell_ms, visible_pct, payload, client_ts)
    values (
      v_user,
      (v_ev->>'content_id')::uuid,
      v_ev->>'event_type',
      (v_ev->>'dwell_ms')::int,
      (v_ev->>'visible_pct')::smallint,
      coalesce(v_ev->'payload', '{}'::jsonb),
      least((v_ev->>'client_ts')::timestamptz, now())
    );

    select * into v_item from public.content_items where id = (v_ev->>'content_id')::uuid;
    continue when v_item.id is null;

    insert into public.user_content_state (user_id, content_id, total_dwell_ms)
    values (v_user, v_item.id, 0)
    on conflict (user_id, content_id) do nothing;

    update public.user_content_state
       set total_dwell_ms = total_dwell_ms + coalesce((v_ev->>'dwell_ms')::int, 0),
           last_seen_at   = now(),
           is_liked       = case v_ev->>'event_type' when 'like' then true
                                                     when 'unlike' then false
                                                     else is_liked end,
           is_skipped     = case when v_ev->>'event_type' = 'skip' then true else is_skipped end
     where user_id = v_user and content_id = v_item.id
    returning * into v_state;

    -- Lese-Validierung: laengenabhaengige Schwelle bei >= 80 % Sichtbarkeit
    if not v_state.is_read_validated
       and v_state.total_dwell_ms >= v_item.dwell_target_ms
       and coalesce((v_ev->>'visible_pct')::smallint, 0) >= 80 then

      update public.user_content_state
         set is_read_validated = true
       where user_id = v_user and content_id = v_item.id;

      if public.award_xp(v_user, 2, 0, 'read', v_item.primary_category_id,
                         'content', v_item.id::text) then
        v_xp := v_xp + 2;
        v_read := v_read + 1;
      end if;
    end if;

    -- Interesse nachziehen. Die Regel selbst steht in
    -- apply_interest_event: staerkere Daempfung bei Skip, Bilanz ueber
    -- "nie geliked", und abnehmender Einfluss je Ereignis.
    --
    -- Ausgelagert, damit beim naechsten Mal nicht wieder diese ganze
    -- Funktion neu geschrieben werden muss - PostgreSQL kennt keine
    -- Teiländerung, und beim ersten Versuch habe ich sie aus einem
    -- Ausschnitt rekonstruiert und dabei award_xp, touch_streak und die
    -- Rueckgabeschluessel verloren. Das faellt nicht beim Einspielen auf,
    -- sondern Tage spaeter daran, dass niemand mehr XP bekommt.
    if v_ev->>'event_type' in ('like','skip') then
      perform public.apply_interest_event(
        v_user, v_item.primary_category_id, v_ev->>'event_type');
    end if;

    -- Explizites Schwierigkeits-Feedback
    if v_ev->>'event_type' in ('too_easy','too_hard') then
      update public.user_categories
         set difficulty_pref = greatest(1, least(5,
               difficulty_pref + case v_ev->>'event_type' when 'too_easy' then 1 else -1 end)),
             updated_at = now()
       where user_id = v_user and category_id = v_item.primary_category_id;
    end if;

  end loop;

  update public.profiles
     set cards_read_total    = cards_read_total + v_read,
         focus_seconds_total = focus_seconds_total +
           coalesce((select sum(coalesce((e->>'dwell_ms')::int,0)) / 1000
                       from jsonb_array_elements(p_events) e), 0)
   where id = v_user;

  perform public.touch_streak(v_user);

  return jsonb_build_object('xp_awarded', v_xp, 'cards_validated', v_read);
end
$fn$;
grant execute on function public.flush_events(jsonb) to authenticated;
