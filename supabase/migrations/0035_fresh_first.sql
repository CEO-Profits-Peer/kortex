-- =============================================================================
-- 0035_fresh_first.sql  ·  Neues zuerst, Wiederholungen sparsam
--
-- Wie es war
-- ----------
-- Reichte das Ungelesene nicht fuer einen vollen Stapel, fuellte get_feed
-- bis zur Batchgroesse mit Gelesenem auf. Das war richtig, solange es nur
-- 41 Demo-Karten gab: ein Feed, der aufhoert, ist schlimmer als einer, der
-- sich wiederholt.
--
-- Inzwischen liefert die Pipeline nach, und die Rechnung dreht sich um.
-- Wer sieben gelesene Karten unter zehn bekommt, denkt nicht "schoen, eine
-- Wiederholung", sondern "hier passiert nichts mehr".
--
-- Wie es jetzt ist
-- ----------------
-- Hoechstens jede zehnte Karte ist eine Wiederholung, mindestens aber eine
-- - die Wiederholung ist Teil des Lernens, sie soll nur nicht den Feed
-- tragen.
--
-- Reicht das Frische trotzdem nicht, kommt ein KUERZERER Stapel zurueck
-- statt eines aufgefuellten. Das ist Absicht: die App laedt ohnehin nach,
-- sobald drei Karten uebrig sind. Ein kurzer Stapel faellt niemandem auf,
-- ein Stapel voller Wiederholungen schon.
--
-- Und: das Gelesene kommt ans ENDE, nicht an zufaellige Stellen. Die erste
-- Karte nach dem Oeffnen ist damit immer neu - der Moment, in dem sich
-- entscheidet, ob jemand bleibt.
-- =============================================================================

create or replace function public.get_feed(p_batch_size int default 10)
returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user    uuid := auth.uid();
  v_p       public.profiles;
  v_langs   text[];
  v_n_news  int;
  v_n_know  int;
  v_repeats int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;

  v_langs := public.user_feed_languages(v_user);
  v_n_news := greatest(1, (p_batch_size * 4) / 10);
  v_n_know := greatest(1, p_batch_size - v_n_news);
  -- Eine Wiederholung pro zehn Karten. Mindestens eine, damit die
  -- Wiederholung nicht ganz verschwindet.
  v_repeats := greatest(1, p_batch_size / 10);

  return query
  with interests as (
    select uc.category_id, uc.interest_weight, uc.difficulty_pref
      from public.user_categories uc
     where uc.user_id = v_user
  ),
  seen as (
    select ucs.content_id, ucs.last_seen_at
      from public.user_content_state ucs
     where ucs.user_id = v_user
  ),
  pool as (
    select ci.id                  as content_id,
           ci.content_type        as content_type,
           (s2.content_id is not null)     as already_seen,
           s2.last_seen_at,
           coalesce(i.interest_weight, 0.3)
           * exp(-extract(epoch from (now() - coalesce(ci.published_at, ci.created_at)))
                 / 172800.0)
           * (1.0 - abs(ci.difficulty - coalesce(i.difficulty_pref, 2)) * 0.18)
           * (coalesce(s.trust_score, 50) / 100.0)
           * public.language_weight(ci.language, v_p.feed_english_pct)
           * (0.85 + random() * 0.3)
             as score
      from public.content_items ci
      join public.categories cat on cat.id = ci.primary_category_id
      left join lateral (
        select ui.interest_weight, ui.difficulty_pref
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
       and (ci.expires_at is null or ci.expires_at > now())
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
  ),
  fresh as (select * from pool where not already_seen),
  picked as (
    (select content_id from fresh where content_type = 'news'
      order by score desc limit v_n_news)
    union
    (select content_id from fresh where content_type in ('knowledge','interactive')
      order by score desc limit v_n_know)
  ),
  -- Wiederholungen: gedeckelt, aeltestes zuerst. Was man vor zwei Wochen
  -- gelesen hat, fuehlt sich wie eine Wiederholung an; was man vor zwei
  -- Minuten gelesen hat, wie ein Fehler.
  repeats as (
    select content_id
      from pool
     where already_seen
       and content_id not in (select content_id from picked)
     order by last_seen_at asc nulls first
     limit v_repeats
  )
  -- Reihenfolge: erst alles Neue in zufaelliger Folge, dann die
  -- Wiederholungen. Damit ist die erste Karte einer Sitzung immer neu.
  select ci.*
    from (
      select content_id, 0 as tier, random() as r from picked
      union all
      select content_id, 1 as tier, random() as r from repeats
    ) f
    join public.content_items ci on ci.id = f.content_id
   order by f.tier, f.r
   limit p_batch_size;
end
$fn$;

grant execute on function public.get_feed(int) to authenticated;
