-- =============================================================================
-- 0057_exploration_fix.sql  ·  Der Erkundungsplatz blieb leer
--
-- Gemessen nach 0056:
--
--     angefragt 10 -> bekommen  8
--     angefragt 10 -> bekommen  8
--     angefragt 20 -> bekommen 17
--
-- Immer rund 15 Prozent zu wenig, also genau der reservierte Anteil. Die
-- Plaetze wurden abgezwackt und blieben leer. Zwei Fehler, beide meine.
--
-- Fehler 1: "ausserhalb der Blase" gibt es gar nicht
-- ---------------------------------------------------
-- Ich habe `in_bubble` daran festgemacht, ob zu einer Kategorie ein
-- Eintrag in user_categories existiert. Der existiert aber IMMER: der
-- Trigger handle_new_user legt beim Anlegen eines Kontos fuer JEDE
-- Kategorie eine Zeile an (0006). Damit war jede Karte "in der Blase",
-- die Erkundungsmenge war leer, und die Bedingung, die ich fuer eine
-- Unterscheidung hielt, war eine Konstante.
--
-- Das ist die Sorte Fehler, die man nur durch Nachmessen findet: die
-- Abfrage war syntaktisch richtig, lief fehlerfrei und tat nichts.
--
-- Richtig ist die Frage nicht "kennt die Datenbank diese Kategorie fuer
-- dich", sondern "hast du je gezeigt, dass sie dich interessiert":
--
--     is_explicit   im Onboarding selbst gewaehlt
--     liked_count   mindestens einmal etwas daraus geliked
--
-- Beides nein heisst: neu fuer dich.
--
-- Fehler 2: nicht gefuellte Plaetze gingen verloren
-- --------------------------------------------------
-- news und knowledge bekamen ihre Obergrenzen aus `batch_size minus
-- Erkundung`. Blieb die Erkundung leer, fehlten die Karten einfach -
-- statt dass der Rest nachrueckt. Jetzt rechnen beide mit der vollen
-- Stapelgroesse, und die Begrenzung macht das abschliessende `limit`.
-- Zu viel zu holen kostet nichts, zu wenig schon.
--
-- Und die Reihenfolge
-- -------------------
-- Erkundung steht jetzt in der ersten Stufe, damit sie nicht vom `limit`
-- abgeschnitten wird. Dass sie dadurch am Anfang stuende, spielt keine
-- Rolle: die App mischt den Stapel ohnehin neu (arrange.ts), damit nie
-- zwei Karten derselben Kategorie aufeinander folgen.
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
      select content_id, 0 as tier, random() as r from explore
      union all
      select content_id, 1 as tier, random() as r from picked
      union all
      select content_id, 2 as tier, random() as r from repeats
    ) f
    join public.content_items ci on ci.id = f.content_id
   order by f.tier, f.r
   limit p_batch_size;
end
$fn$;

grant execute on function public.get_feed(int, uuid[]) to authenticated;
