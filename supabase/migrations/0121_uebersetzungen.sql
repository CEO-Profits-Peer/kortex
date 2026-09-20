-- =============================================================================
-- 0121_uebersetzungen.sql  ·  Dieselbe Karte in der anderen Sprache
--
-- Eine uebersetzte Karte ist eine eigene Zeile in content_items: eigene
-- Sprache, eigenes Quiz, eigener Fingerabdruck - aber mit `uebersetzt_aus`
-- auf das Original. Beide zusammen sind eine FAMILIE (`familie`, berechnet
-- aus uebersetzt_aus oder der eigenen id).
--
-- Warum das ueberhaupt geht: der Text der Karte wurde beim Erzeugen gegen
-- den Quelltext geprueft. Eine Uebersetzung erbt diese Pruefung, statt eine
-- neue Behauptung aufzustellen - sie ist deshalb billiger UND sicherer als
-- eine zweite Karte aus einem zweiten Artikel.
--
-- Die eine Regel, die dabei nicht brechen darf: NIEMAND bekommt dieselbe
-- Karte zweimal, nur in zwei Sprachen. Deshalb filtern der Feed und
-- "Dazu passt" ueber die Familie statt ueber die id. Die Suche nicht: wer
-- gezielt sucht, darf beide Fassungen finden.
--
-- Was NICHT uebersetzt wird, entscheidet die Pipeline (pipeline/uebersetzen.py):
-- keine Nachrichten (sie veralten), keine Kurslektionen (die haengen an
-- ihrem Kurs). Regionale Wissenskarten dagegen schon - "Wiener Linien" auf
-- Englisch ist genau das, was Zugezogene brauchen; der Regionsfilter bleibt.
--
-- get_feed vollstaendig aus 0067, verwandte_karten vollstaendig aus 0109,
-- jeweils nur um den Familien-Filter ergaenzt.
-- =============================================================================

alter table public.content_items
  add column if not exists uebersetzt_aus uuid references public.content_items(id) on delete set null;

-- Berechnet und gespeichert: die id der Familie. Fuer das Original es
-- selbst, fuer die Uebersetzung das Original.
alter table public.content_items
  add column if not exists familie uuid generated always as (coalesce(uebersetzt_aus, id)) stored;

create index if not exists content_items_familie_idx on public.content_items (familie);
create index if not exists content_items_uebersetzt_idx on public.content_items (uebersetzt_aus)
  where uebersetzt_aus is not null;

comment on column public.content_items.uebersetzt_aus is
  'Die Karte, aus der diese uebersetzt wurde (0121). Leer bei Originalen.';


-- --- get_feed (vollstaendig aus 0067, plus Familien-Filter) ------------------
create or replace function public.get_feed(
  p_batch_size int default 10,
  p_exclude uuid[] default '{}'
)
returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user      uuid := auth.uid();
  v_p         public.profiles;
  v_langs     text[];
  v_n_explore int;
  v_n_news    int;
  v_n_know    int;
  v_repeats   int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;

  v_langs := public.user_feed_languages(v_user);

  v_n_explore := ceil(p_batch_size * public.exploration_share())::int;
  -- Volle Stapelgroesse, nicht abzueglich Erkundung: was hier zu viel
  -- geholt wird, schneidet das `limit` am Ende weg. Was zu wenig geholt
  -- wird, fehlt.
  v_n_news    := greatest(1, (p_batch_size * 4) / 10);
  v_n_know    := greatest(1, p_batch_size - v_n_news);
  v_repeats   := greatest(1, p_batch_size / 10);

  return query
  with interests as (
    select uc.category_id, uc.interest_weight, uc.difficulty_pref,
           uc.is_explicit, uc.liked_count
      from public.user_categories uc
     where uc.user_id = v_user
  ),
  seen as (
    select ucs.content_id, ucs.last_seen_at
      from public.user_content_state ucs
     where ucs.user_id = v_user
  ),
  -- 0121: Eine Karte und ihre Uebersetzung sind EINE Familie. Wer die eine
  -- gesehen hat, bekommt die andere nicht mehr - sonst steht dieselbe
  -- Karte zweimal im Feed, nur in zwei Sprachen.
  seen_fam as (
    select distinct ci2.familie
      from seen sn
      join public.content_items ci2 on ci2.id = sn.content_id
  ),
  pool as (
    select ci.id                  as content_id,
           ci.content_type        as content_type,
           (s2.content_id is not null)     as already_seen,
           -- Interessiert dich diese Kategorie nachweislich? Nur dann ist
           -- sie "in der Blase". Ein blosser Tabelleneintrag zaehlt nicht -
           -- den hat jede Kategorie ab dem ersten Tag.
           (coalesce(i.is_explicit, false) or coalesce(i.liked_count, 0) > 0) as in_bubble,
           s2.last_seen_at,
           coalesce(i.interest_weight, 0.3)
           * case
               when ci.content_type = 'news' then
                 greatest(
                   0.06,
                   exp(-extract(epoch from (now() - coalesce(ci.published_at, ci.created_at)))
                       / 172800.0)
                 )
               else 0.85
             end
           * (1.0 - abs(ci.difficulty - coalesce(i.difficulty_pref, 2)) * 0.18)
           * (coalesce(s.trust_score, 50) / 100.0)
           * public.language_weight(ci.language, v_p.feed_english_pct)
           -- Beliebtheit: gedaempft und gedeckelt.
           --
           -- Logarithmisch, weil der Unterschied zwischen 0 und 3 Likes
           -- etwas heisst und der zwischen 40 und 43 nichts. Gedeckelt bei
           -- +25 %, erreicht ab etwa elf Likes - danach bringt jeder
           -- weitere nichts mehr.
           --
           -- Warum das hier ungefaehrlich ist, obwohl "beliebtes zuerst"
           -- sonst zur Rueckkopplung fuehrt: der Feed nimmt nur, was DU
           -- noch nicht gesehen hast. Eine Karte faellt nach dem ersten
           -- Mal aus deinem Pool - Beliebtheit kann also die REIHENFOLGE
           -- verschieben, aber niemals dauerhaft den Platz besetzen. Der
           -- uebliche Effekt (dieselben zehn Sachen fuer immer) braucht
           -- einen Feed, der Gesehenes erneut ausspielt.
           --
           -- Und der Faktor ist bewusst kleiner als jeder andere: Aktualitaet
           -- (bis 0.06), Interesse, Schwierigkeit und Quellenvertrauen
           -- entscheiden weiterhin. Beliebtheit ist der Stichentscheid,
           -- nicht das Kriterium.
           * (1.0 + least(ln(1 + ci.like_count::numeric) / 10.0, 0.25))
           * (0.85 + random() * 0.3)
             as score
      from public.content_items ci
      join public.categories cat on cat.id = ci.primary_category_id
      left join lateral (
        select ui.interest_weight, ui.difficulty_pref, ui.is_explicit, ui.liked_count
          from interests ui
         where ui.category_id = ci.primary_category_id
            or ui.category_id = cat.parent_id
         order by (ui.category_id = ci.primary_category_id) desc
         limit 1
      ) i on true
      left join public.sources s on s.id = ci.primary_source_id
      left join seen s2 on s2.content_id = ci.id
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and ci.content_type <> 'course_lesson'
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
       and not (ci.id = any(p_exclude))
       -- Die gesehene Fassung selbst darf bleiben (sie kann als
       -- Wiederholung wiederkommen); die andere Sprachfassung nicht.
       and (s2.content_id is not null
            or not exists (select 1 from seen_fam sf where sf.familie = ci.familie))
  ),
  fresh as (select * from pool where not already_seen),
  explore as (
    select content_id from fresh
     where not in_bubble
     -- Per Zufall, nicht per Score: der Score ist genau das, was diese
     -- Karten benachteiligt. Nach ihm zu sortieren hiesse, innerhalb der
     -- Erkundung wieder dieselben drei Kategorien zu bevorzugen.
     order by random()
     limit v_n_explore
  ),
  picked as (
    (select content_id from fresh
      where content_type = 'news' and content_id not in (select content_id from explore)
      order by score desc limit v_n_news)
    union
    (select content_id from fresh
      where content_type in ('knowledge','interactive')
        and content_id not in (select content_id from explore)
      order by score desc limit v_n_know)
  ),
  -- NEU (0060): auffuellen mit allem, was noch frisch ist.
  --
  -- Ohne Ruecksicht auf Typ und Quote - das ist der ganze Punkt. Wenn die
  -- Nachrichtenquote leerlaeuft, soll die Luecke mit ungesehenem Wissen
  -- zugehen und nicht mit einer Wiederholung.
  --
  -- Nach Score sortiert, damit die Reihenfolge innerhalb des Frischen
  -- bleibt, wie sie war: die interessantere Karte zuerst. Das Interesse
  -- entscheidet weiterhin ueber die REIHENFOLGE, nur nicht mehr darueber,
  -- OB eine ungesehene Karte ueberhaupt vorkommt.
  filler as (
    select content_id from fresh
     where content_id not in (select content_id from explore)
       and content_id not in (select content_id from picked)
     order by score desc
     limit greatest(
             0,
             p_batch_size
               - (select count(*) from explore)
               - (select count(*) from picked)
           )
  ),
  repeats as (
    select content_id
      from pool
     where already_seen
       and content_id not in (select content_id from picked)
       and content_id not in (select content_id from explore)
       and content_id not in (select content_id from filler)
     order by last_seen_at asc nulls first
     -- Jetzt gegen ALLE drei frischen Stufen gerechnet. Solange ueberhaupt
     -- etwas Ungesehenes da ist, bleibt hier fast nichts uebrig - und genau
     -- so soll es sein.
     limit case
             when (select count(*) from picked)
                + (select count(*) from explore)
                + (select count(*) from filler) = 0
               then p_batch_size
             else v_repeats
           end
  )
  select ci.*
    from (
      select content_id, 0 as tier, random() as r from explore
      union all
      select content_id, 1 as tier, random() as r from picked
      union all
      select content_id, 2 as tier, random() as r from filler
      union all
      select content_id, 3 as tier, random() as r from repeats
    ) f
    join public.content_items ci on ci.id = f.content_id
   order by f.tier, f.r
   limit p_batch_size;
end
$fn$;


-- --- verwandte_karten (vollstaendig aus 0109, plus Familien-Filter) ---------
create or replace function public.verwandte_karten(p_ids uuid[], p_n int default 3)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with basis as (
    select embedding from public.content_items
     where id = any (p_ids[1:10]) and embedding is not null
  ),
  kandidaten as (
    select ci.id, ci.title, ci.primary_category_id,
           min(ci.embedding operator(public.<=>) b.embedding) as abstand
      from public.content_items ci
      cross join basis b
     where ci.status = 'approved'
       and ci.embedding is not null
       and not (ci.id = any (p_ids))
       and ci.language = any (public.user_feed_languages(auth.uid()))
       -- 0121: gelesen zaehlt fuer die ganze Familie - sonst schlaegt
       -- "Dazu passt" die Uebersetzung dessen vor, was man gerade las.
       and not exists (select 1 from public.user_content_state s
                        join public.content_items f on f.id = s.content_id
                       where s.user_id = auth.uid() and f.familie = ci.familie
                         and s.is_read_validated)
     group by ci.id, ci.title, ci.primary_category_id
     order by abstand
     limit greatest(1, least(coalesce(p_n, 3), 6))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'content_id', id, 'title', title, 'category', primary_category_id
         ) order by abstand), '[]'::jsonb)
    from kandidaten;
$fn$;


do $test$
declare
  v_a uuid;
  v_b uuid;
  v_user uuid;
  v_n int;
begin
  select id into v_a from public.content_items where status = 'approved' and content_type = 'knowledge' limit 1;
  select id into v_user from public.profiles order by created_at limit 1;
  if v_a is null or v_user is null then raise notice 'Selbsttest 0121: zu wenig Daten'; return; end if;
  begin
    -- Eine Schein-Uebersetzung anlegen und pruefen, dass beide dieselbe
    -- Familie haben und der Feed nicht beide zeigt.
    insert into public.content_items (
      content_hash, title, deck, body_blocks, language, primary_category_id, category_ids,
      status, content_type, uebersetzt_aus)
    select 'selbsttest-0121-' || v_a::text, 'Selbsttest', deck, body_blocks, case when language = 'de' then 'en' else 'de' end,
           primary_category_id, category_ids, 'approved', 'knowledge', v_a
      from public.content_items where id = v_a
    returning id into v_b;

    if (select familie from public.content_items where id = v_b)
       <> (select familie from public.content_items where id = v_a) then
      raise exception 'Selbsttest 0121: verschiedene Familien';
    end if;

    -- Als gesehen markieren und zaehlen, wie oft die Familie im Feed vorkommt.
    insert into public.user_content_state (user_id, content_id, is_read_validated)
    values (v_user, v_a, true)
    on conflict (user_id, content_id) do update set is_read_validated = true;

    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.get_feed(30) g where g.id = v_b;
    if v_n > 0 then raise exception 'Selbsttest 0121: Uebersetzung trotz gesehenem Original im Feed'; end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0121: ok';
end
$test$;

notify pgrst, 'reload schema';
