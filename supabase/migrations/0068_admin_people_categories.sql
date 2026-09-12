-- =============================================================================
-- 0068_admin_people_categories.sql  ·  Personen suchen, Kategorien aufschluesseln
--
-- In 0064 steht, dass das Kontrollzentrum bewusst KEINE Einzelpersonen zeigt,
-- und dazu der Satz: "Wer spaeter eine einzelne Sitzung untersuchen muss,
-- baut das als eigene Funktion mit eigener Begruendung."
--
-- Hier ist die eigene Funktion, und hier ist die Begruendung: ohne sie ist
-- keine Unterstuetzung moeglich. "Mein Feed ist nur auf Deutsch", "ich
-- bekomme keine Wiederholungen", "meine Strähne ist weg" - auf keine dieser
-- Fragen gibt es eine Antwort aus Summen ueber alle Konten. Der Betreiber
-- kommt sonst an die Daten heran, indem er den service_role-Schluessel
-- benutzt, und der umgeht JEDE Regel dieser Datenbank. Eine enge Funktion mit
-- PIN davor ist der kleinere Zugriff, nicht der groessere.
--
-- Was diese Funktionen trotzdem NICHT hergeben
-- --------------------------------------------
--   * Keine Kartentitel. Was jemand gelesen hat, bleibt bei ihm. Statt einer
--     Leseliste kommt die VERTEILUNG der letzten 100 gesehenen Karten auf
--     Kategorien - das beantwortet "was bekommt diese Person zu sehen"
--     genauso gut und liest niemandem ueber die Schulter. Wer die Titel
--     wirklich braucht, aendert genau eine Unterabfrage und schreibt in den
--     Kopf, warum.
--   * Keine Kommentartexte, keine Likes auf einzelne Karten.
--   * Kein admin_pin_hash, auch nicht der eigene.
--
-- Die PIN-Pruefung liegt ab jetzt in assert_admin(). In 0064 steht sie noch
-- inline; das bleibt so, weil eine funktionierende Absicherung umzubauen der
-- schlechteste Zeitpunkt fuer einen Fehler ist. Neue Funktionen nehmen den
-- Helfer.
-- =============================================================================

-- --- Ein Schloss fuer alle neuen Tueren --------------------------------------
--
-- Nicht ausfuehrbar fuer irgendjemanden von aussen: nur die Funktionen in
-- diesem Schema rufen sie auf, und die laufen als Eigentuemer.
create or replace function public.assert_admin(p_pin text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_admin boolean;
  v_hash  text;
begin
  select p.is_admin, p.admin_pin_hash into v_admin, v_hash
    from public.profiles p where p.id = v_me;

  -- Ein Satz fuer alle Faelle - nicht angemeldet, kein Admin, falsche PIN.
  -- "Admin ja, PIN falsch" waere die Auskunft, dass Weiterprobieren lohnt.
  if v_me is null
     or not coalesce(v_admin, false)
     or v_hash is null
     or v_hash <> extensions.crypt(coalesce(p_pin, ''), v_hash) then
    raise exception 'kein Zugang';
  end if;
end
$fn$;

revoke all on function public.assert_admin(text) from public, anon, authenticated;


-- =============================================================================
-- Kategorien, vollstaendig
--
-- Die Uebersicht sagt nur "N Kategorien ohne Karte". Das ist die Warnlampe.
-- Hier steht, welche - mit Bestand, Sprachaufteilung und Lesequote, damit man
-- sieht, ob eine Kategorie leer ist oder nur unbeliebt. Das sind zwei ganz
-- verschiedene Probleme: das eine loest die Pipeline, das andere nicht.
-- =============================================================================
create or replace function public.admin_categories(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  perform public.assert_admin(p_pin);

  select coalesce(jsonb_agg(z order by karten desc, id), '[]'::jsonb) into v_out
  from (
    select c.id                                             as id,
           c.display_name                                   as name,
           c.parent_id                                      as eltern,
           c.kind                                           as art,
           c.accent_hex                                     as farbe,
           coalesce(k.karten, 0)                            as karten,
           coalesce(k.de, 0)                                as de,
           coalesce(k.en, 0)                                as en,
           coalesce(k.kinetic, 0)                           as erklaerkarten,
           coalesce(k.likes, 0)                             as likes,
           coalesce(a.gesehen, 0)                           as gesehen,
           coalesce(a.gelesen, 0)                           as gelesen,
           coalesce(u.leute, 0)                             as interessiert,
           k.neuste                                         as neuste,
           jsonb_build_object(
             'id', c.id, 'name', c.display_name, 'eltern', c.parent_id,
             'art', c.kind, 'farbe', c.accent_hex,
             'karten', coalesce(k.karten, 0),
             'de', coalesce(k.de, 0), 'en', coalesce(k.en, 0),
             'erklaerkarten', coalesce(k.kinetic, 0),
             'likes', coalesce(k.likes, 0),
             'gesehen', coalesce(a.gesehen, 0),
             'gelesen', coalesce(a.gelesen, 0),
             'interessiert', coalesce(u.leute, 0),
             'neuste', k.neuste
           ) as z
      from public.categories c
      left join lateral (
        select count(*)                                            as karten,
               count(*) filter (where ci.language = 'de')          as de,
               count(*) filter (where ci.language = 'en')          as en,
               count(*) filter (where ci.presentation_mode = 'kinetic') as kinetic,
               sum(ci.like_count)                                  as likes,
               max(ci.created_at)                                  as neuste
          from public.content_items ci
         where ci.primary_category_id = c.id and ci.status = 'approved'
      ) k on true
      left join lateral (
        select count(*)                                              as gesehen,
               count(*) filter (where ucs.is_read_validated)         as gelesen
          from public.user_content_state ucs
          join public.content_items ci2 on ci2.id = ucs.content_id
         where ci2.primary_category_id = c.id
      ) a on true
      left join lateral (
        select count(*) as leute
          from public.user_categories uc
         where uc.category_id = c.id and uc.is_explicit
      ) u on true
     where c.is_active and c.parent_id is not null
  ) q;

  return v_out;
end
$fn$;

revoke execute on function public.admin_categories(text) from anon;
grant  execute on function public.admin_categories(text) to authenticated;


-- =============================================================================
-- Personen suchen
--
-- Ohne Suchbegriff die zuletzt aktiven - das ist der Fall, den man oeffnet,
-- wenn gerade jemand schreibt, dass etwas nicht geht.
-- =============================================================================
create or replace function public.admin_people(p_pin text, p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_q   text := nullif(trim(coalesce(p_query, '')), '');
  v_out jsonb;
begin
  perform public.assert_admin(p_pin);

  -- Das fuehrende @ abschneiden: man tippt Handles so, wie sie in der App
  -- stehen. Und die Platzhalter escapen, sonst findet die Suche nach "%"
  -- jeden.
  if v_q is not null then
    v_q := replace(replace(ltrim(v_q, '@'), '%', '\%'), '_', '\_');
  end if;

  select coalesce(jsonb_agg(z order by zuletzt desc nulls last), '[]'::jsonb) into v_out
  from (
    select p.last_active_date as zuletzt,
           jsonb_build_object(
             'handle',       p.handle,
             'name',         p.display_name,
             'avatar_seed',  p.avatar_seed,
             'avatar_path',  p.avatar_path,
             'seit',         p.created_at,
             'zuletzt',      p.last_active_date,
             'land',         p.country_code,
             'region',       p.region_code,
             'sprache',      p.language,
             'plan',         p.plan,
             'xp',           p.xp_total,
             'mastery',      p.mastery_total,
             'streak',       p.streak_current,
             'gelesen',      p.cards_read_total,
             'ist_admin',    p.is_admin
           ) as z
      from public.profiles p
     where v_q is null
        or p.handle ilike '%' || v_q || '%'
        or p.display_name ilike '%' || v_q || '%'
     order by p.last_active_date desc nulls last, p.created_at desc
     limit 25
  ) q;

  return v_out;
end
$fn$;

revoke execute on function public.admin_people(text, text) from anon;
grant  execute on function public.admin_people(text, text) to authenticated;


-- =============================================================================
-- Eine Person
-- =============================================================================
create or replace function public.admin_person(p_pin text, p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_id  uuid;
  v_p   public.profiles;
  v_out jsonb;
begin
  perform public.assert_admin(p_pin);

  select * into v_p from public.profiles
   where handle = ltrim(coalesce(p_handle, ''), '@');
  if v_p.id is null then
    raise exception 'niemand mit diesem Handle';
  end if;
  v_id := v_p.id;

  select jsonb_build_object(

    'person', jsonb_build_object(
      'handle', v_p.handle, 'name', v_p.display_name, 'bio', v_p.bio,
      'avatar_seed', v_p.avatar_seed, 'avatar_path', v_p.avatar_path,
      'seit', v_p.created_at, 'zuletzt', v_p.last_active_date,
      'land', v_p.country_code, 'region', v_p.region_code,
      'sprache', v_p.language, 'englisch_pct', v_p.feed_english_pct,
      'jahrgang', v_p.birth_year, 'plan', v_p.plan,
      'tagesziel', v_p.daily_goal_cards,
      'rangliste', v_p.leaderboard_opt_in,
      'onboarding', v_p.onboarding_completed_at,
      'ist_admin', v_p.is_admin
    ),

    'lernen', jsonb_build_object(
      'xp', v_p.xp_total, 'mastery', v_p.mastery_total,
      'streak', v_p.streak_current, 'streak_best', v_p.streak_best,
      'gelesen', v_p.cards_read_total,
      'fokus_sekunden', v_p.focus_seconds_total,
      'wiederholungen_faellig', (
        select count(*) from public.review_queue r
         where r.user_id = v_id and r.due_at <= now() and not r.is_retired
      )
    ),

    'aufmerksamkeit', jsonb_build_object(
      'paare',    (select count(*) from public.user_content_state u where u.user_id = v_id),
      'gelesen',  (select count(*) from public.user_content_state u
                    where u.user_id = v_id and u.is_read_validated),
      'geskippt', (select count(*) from public.user_content_state u
                    where u.user_id = v_id and u.is_skipped),
      'geliked',  (select count(*) from public.user_content_state u
                    where u.user_id = v_id and u.is_liked),
      'verweildauer_median_ms', (
        select coalesce(percentile_cont(0.5) within group (order by u.total_dwell_ms), 0)
          from public.user_content_state u where u.user_id = v_id
      )
    ),

    'aktivitaet', jsonb_build_object(
      'tage_30', (
        select count(distinct date_trunc('day', ce.created_at))
          from public.content_events ce
         where ce.user_id = v_id and ce.created_at > now() - interval '30 days'
      ),
      'letztes_ereignis', (
        select max(ce.created_at) from public.content_events ce where ce.user_id = v_id
      ),
      'ereignisse_30', (
        select coalesce(jsonb_agg(z order by anzahl desc), '[]'::jsonb) from (
          select jsonb_build_object('art', ce.event_type, 'anzahl', count(*)) as z,
                 count(*) as anzahl
            from public.content_events ce
           where ce.user_id = v_id and ce.created_at > now() - interval '30 days'
           group by ce.event_type
        ) q
      ),
      -- Ein Balken je Tag, aelteste zuerst. Reicht fuer die einzige Frage,
      -- die man hier stellt: kommt die Person wieder oder war sie einmal da?
      'tage', (
        select coalesce(jsonb_agg(z order by tag), '[]'::jsonb) from (
          select jsonb_build_object(
                   'tag', to_char(d.tag, 'YYYY-MM-DD'),
                   'anzahl', coalesce(e.n, 0)) as z,
                 d.tag as tag
            from generate_series(
                   date_trunc('day', now() - interval '29 days'),
                   date_trunc('day', now()),
                   interval '1 day') d(tag)
            left join (
              select date_trunc('day', ce.created_at) as tag, count(*) as n
                from public.content_events ce
               where ce.user_id = v_id and ce.created_at > now() - interval '30 days'
               group by 1
            ) e on e.tag = d.tag
        ) q
      )
    ),

    -- Was diese Person zu sehen bekommt - als Verteilung, nicht als Leseliste.
    -- Siehe Kopf: die Frage "warum sehe ich nur X" wird davon beantwortet,
    -- die Frage "was hat sie gelesen" bewusst nicht.
    'sicht', jsonb_build_object(
      'interessen', (
        select coalesce(jsonb_agg(z order by gewicht desc), '[]'::jsonb) from (
          select jsonb_build_object(
                   'id', uc.category_id,
                   'name', c.display_name,
                   'gewicht', uc.interest_weight,
                   'gewaehlt', uc.is_explicit,
                   'level', uc.level,
                   'mastery', uc.mastery_score) as z,
                 uc.interest_weight as gewicht
            from public.user_categories uc
            join public.categories c on c.id = uc.category_id
           where uc.user_id = v_id
           order by uc.interest_weight desc
           limit 10
        ) q
      ),
      'letzte_100', (
        select coalesce(jsonb_agg(z order by anzahl desc), '[]'::jsonb) from (
          select jsonb_build_object(
                   'id', ci.primary_category_id,
                   'anzahl', count(*),
                   'sprache_de', count(*) filter (where ci.language = 'de')) as z,
                 count(*) as anzahl
            from (
              select u.content_id
                from public.user_content_state u
               where u.user_id = v_id
               order by u.last_seen_at desc nulls last
               limit 100
            ) letzte
            join public.content_items ci on ci.id = letzte.content_id
           group by ci.primary_category_id
        ) q
      )
    ),

    'sozial', jsonb_build_object(
      'folgt',     v_p.following_count,
      'follower',  v_p.follower_count,
      'reposts',   (select count(*) from public.reposts r where r.user_id = v_id),
      'kommentare',(select count(*) from public.comments k where k.user_id = v_id)
    ),

    'stand', now()
  ) into v_out;

  return v_out;
end
$fn$;

revoke execute on function public.admin_person(text, text) from anon;
grant  execute on function public.admin_person(text, text) to authenticated;
