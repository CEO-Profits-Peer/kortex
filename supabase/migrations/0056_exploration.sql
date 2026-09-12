-- =============================================================================
-- 0056_exploration.sql  ·  15 Prozent Erkundung
--
-- Die Sackgasse
-- -------------
-- In get_feed stand `coalesce(i.interest_weight, 0.3)`. Eine Kategorie,
-- die im Onboarding nicht gewaehlt wurde, startete also bei 0.3 statt
-- 1.0 - und damit beginnt ein Kreis, der sich selbst schliesst:
--
--     kommt selten vor  ->  kann nicht geliked werden
--                       ->  Gewicht steigt nie
--                       ->  kommt selten vor
--
-- Beim Start mit sieben Oberpunkten fiel das kaum auf. Seit 0050 gibt es
-- 44 Unterkategorien, und die achtzehn neuen waeren nach dieser Regel
-- praktisch unsichtbar geblieben - Karten, die erzeugt, geprueft und
-- gespeichert werden und nie jemand sieht.
--
-- Die Loesung ist kein hoeherer Startwert. Den hochzudrehen hiesse, alle
-- Kategorien gleich zu behandeln, und dann waere die Interessenwahl im
-- Onboarding sinnlos. Stattdessen ein fester PLATZ im Stapel:
--
--     15 Prozent jedes Stapels sind Erkundung.
--
-- Bei zehn Karten also anderthalb, aufgerundet zwei. Diese Plaetze
-- bekommen ausdruecklich Kategorien, die NICHT in der Blase liegen, und
-- werden untereinander nach Neuheit gemischt statt nach Interesse -
-- sonst gewinnt dort immer dieselbe.
--
-- Warum ein fester Platz und kein hoeheres Gewicht
-- ------------------------------------------------
-- Ein Gewicht konkurriert; ein reservierter Platz nicht. Mit Gewichten
-- haette eine gut gelernte Kategorie (Faktor 5) eine unbekannte (0.3)
-- weiterhin sechzehnfach ueberboten, und "ein bisschen Erkundung" waere
-- in der Praxis null geblieben. Reservieren heisst reservieren.
--
-- Was hier bewusst NICHT passiert
-- --------------------------------
-- Ich wollte ein Kennzeichen mitgeben, damit die App diese Karten
-- anschreiben kann ("Neu fuer dich"). Das haette die Rueckgabe von
-- `setof content_items` auf eine erweiterte Zeile geaendert - und damit
-- jede Stelle in der App gebrochen, die den Feed liest. Ausserdem laesst
-- `create or replace` einen geaenderten Rueckgabetyp gar nicht zu, es
-- braeuchte ein drop.
--
-- Dafuer ist die Frage auch nicht entschieden: gefragt war, ob Erkundung
-- stumm oder angeschrieben sein soll, beantwortet wurde nur der Anteil.
-- Also erst mal stumm. Das Anschreiben ist eine eigene Migration wert,
-- wenn es gewollt ist.
-- =============================================================================

-- Der Anteil. Als Funktion, damit er an einer Stelle steht und nicht in
-- einer Zahl mitten im Abfragetext verschwindet.
create or replace function public.exploration_share()
returns numeric
language sql immutable set search_path = ''
as $fn$ select 0.15::numeric $fn$;


create or replace function public.get_feed(
  p_batch_size int default 10,
  p_exclude uuid[] default '{}'
)
returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user    uuid := auth.uid();
  v_p       public.profiles;
  v_langs   text[];
  v_n_explore int;
  v_n_news  int;
  v_n_know  int;
  v_repeats int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;

  v_langs := public.user_feed_languages(v_user);

  -- Erst die Erkundung abzwacken, dann den Rest aufteilen. Andersherum
  -- waere sie das, was uebrig bleibt - und uebrig bleibt erfahrungsgemaess
  -- nichts.
  v_n_explore := ceil(p_batch_size * public.exploration_share())::int;
  v_n_news  := greatest(1, ((p_batch_size - v_n_explore) * 4) / 10);
  v_n_know  := greatest(1, p_batch_size - v_n_explore - v_n_news);
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
           -- In der Blase? Entscheidet, ob eine Karte fuer den
           -- Erkundungsplatz in Frage kommt.
           (i.interest_weight is not null) as in_bubble,
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
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
       and not (ci.id = any(p_exclude))
  ),
  fresh as (select * from pool where not already_seen),
  -- --- Der reservierte Teil ---------------------------------------------
  --
  -- Ausserhalb der Blase, und untereinander per Zufall statt per Score:
  -- der Score IST ja gerade das, was diese Karten benachteiligt. Nach
  -- Score zu sortieren hiesse, innerhalb der Erkundung wieder dieselben
  -- drei Kategorien zu bevorzugen.
  explore as (
    select content_id from fresh
     where not in_bubble
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
  repeats as (
    select content_id
      from pool
     where already_seen
       and content_id not in (select content_id from picked)
       and content_id not in (select content_id from explore)
     order by last_seen_at asc nulls first
     limit case
             when (select count(*) from picked) + (select count(*) from explore) = 0
               then p_batch_size
             else v_repeats
           end
  )
  select ci.*
    from (
      select content_id, 0 as tier, random() as r from picked
      union all
      select content_id, 0 as tier, random() as r from explore
      union all
      select content_id, 1 as tier, random() as r from repeats
    ) f
    join public.content_items ci on ci.id = f.content_id
   order by f.tier, f.r
   limit p_batch_size;
end
$fn$;

grant execute on function public.get_feed(int, uuid[]) to authenticated;
