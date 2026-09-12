-- =============================================================================
-- 0060_fresh_beats_repeat.sql  ·  Neues schlaegt Wiederholung. Immer.
--
-- Die Beobachtung
-- ---------------
-- "Es fuehlt sich nicht an, als wuerde ich durch 160 Karten scrollen." Und
-- dazu die Regel, die daraus folgt: egal wie wenig mich eine Kategorie
-- interessiert - eine Karte, die ich noch nie gesehen habe, ist besser als
-- eine, die ich schon kenne.
--
-- Nachgemessen, bevor etwas geaendert wurde:
--
--     Nutzer mit den meisten Aufrufen: 110 von 160 Karten gesehen
--     Interessengewichte: 0.10 (science.space) bis 2.50 (world)
--
-- Also Faktor 25 zwischen der liebsten und der ungeliebtesten Kategorie -
-- und fuenfzig ungesehene Karten, die trotzdem nicht kamen.
--
-- Warum sie nicht kamen
-- ---------------------
-- Nicht wegen des Gewichts. Der Stapel wird in FESTE QUOTEN geteilt:
--
--     v_n_news := (p_batch_size * 4) / 10     -- 4 von 10
--     v_n_know := p_batch_size - v_n_news     -- 6 von 10
--
-- Beide Quoten ziehen nur aus `fresh`. Laesst sich eine davon nicht
-- fuellen - und Nachrichten gehen zuerst aus, es gibt nur 49 davon -, dann
-- bleibt der Stapel unter p_batch_size, und die Luecke fuellt `repeats`.
--
-- Das ist der Fehler: die Luecke wird mit einer WIEDERHOLUNG gefuellt,
-- obwohl vom anderen Typ noch ungesehene Karten daliegen. Die Quote ist
-- als Mischungsverhaeltnis gedacht und wirkt als Obergrenze.
--
-- Man sieht es dem alten Code nicht an. Er liest sich wie "erst neu, dann
-- Wiederholungen", und genau so ist er auch sortiert (tier 0/1/2). Nur
-- entscheidet die Sortierung nichts mehr, wenn oben zu wenig eingesammelt
-- wurde.
--
-- Die Aenderung
-- -------------
-- Eine Stufe dazwischen: `filler`. Sie nimmt, was nach explore und picked
-- an FRISCHEN Karten uebrig ist - ohne Ruecksicht auf Typ und Quote - und
-- fuellt damit auf p_batch_size auf. Erst wenn auch das nichts mehr
-- hergibt, kommen Wiederholungen.
--
-- Die Quoten bleiben, was sie sein sollten: ein Ziel fuer die Mischung,
-- solange genug da ist. Sie sind keine Obergrenze mehr.
--
-- Was sich dadurch NICHT aendert
-- ------------------------------
-- Die Reihenfolge innerhalb des Frischen. Wer Weltgeschehen liked und
-- Astronomie nie, bekommt Weltgeschehen weiterhin zuerst - der Score
-- entscheidet, welche frische Karte oben liegt. Er entscheidet nur nicht
-- mehr, OB eine frische Karte kommt.
--
-- Warum Wiederholungen ueberhaupt bleiben
-- ---------------------------------------
-- Weil die App auf Wiederholung nach drei Tagen gebaut ist - das ist der
-- Lerneffekt, nicht ein Mangel an Material. Ein Feed, der nie
-- wiederholt, ist ein Feed, aus dem man nichts behaelt. Neu ist besser als
-- Wiederholung; nichts ist schlechter als beides.
-- =============================================================================

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
