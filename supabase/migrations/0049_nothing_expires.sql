-- =============================================================================
-- 0049_nothing_expires.sql  ·  Nichts verschwindet mehr
--
-- Zwei Wuensche, eine Ursache
-- ---------------------------
--   "Warum muessen allgemeine Wissenskarten verschwinden - wir haben die
--    Karten doch. Ich will mehr fuer immer."
--   "Lassen wir News nicht verschwinden, sondern deutlich als NICHT
--    AKTUELL markieren."
--
-- Es gab dafuer zwei getrennte Mechanismen, und der zweite war mir selbst
-- nicht bewusst.
--
-- 1. Das Verfallsdatum. Nachrichtenkarten bekamen expires_at = +14 Tage,
--    und get_feed filterte sie danach weg. Das war Absicht.
--
-- 2. Die Frische-Kurve. Und die galt fuer ALLES:
--
--        exp(-alter_in_sekunden / 172800)      -- 172800 s = 2 Tage
--
--    Gemessen am echten Bestand:
--
--        2 Tage alt  ->  Faktor 0.33
--        7 Tage alt  ->  Faktor 0.027
--       30 Tage alt  ->  Faktor 0.0000003
--
--    Eine Wissenskarte ueber Zinseszins hatte nach einer Woche ein
--    Siebenunddreissigstel der Chance einer zwei Tage alten, nach einem
--    Monat praktisch keine mehr. Sie stand weiter in der Datenbank, sie
--    lief nicht ab - sie kam nur nicht mehr vor. "Fuer immer gespeichert"
--    und "fuer immer im Feed" sind eben zwei verschiedene Dinge, und ich
--    hatte nur das erste geprueft.
--
--    Das ist der unangenehmere der beiden Fehler: der erste war eine
--    Entscheidung, die man diskutieren kann. Der zweite hat die
--    Entscheidung stillschweigend ueberschrieben.
--
-- Was jetzt gilt
-- --------------
--   * Kein Verfallsdatum mehr, fuer nichts. Auch alte Nachrichten
--     bleiben abrufbar - die App zeigt sie mit "NICHT AKTUELL" und dem
--     Datum, statt sie zu verstecken.
--   * Frische zaehlt nur noch dort, wo sie etwas bedeutet: bei
--     Nachrichten. Und auch dort mit einem Boden, damit eine historische
--     Meldung gelegentlich auftaucht statt nie.
--   * Wissen bekommt einen festen Wert. Ein Sachverhalt ist nicht
--     schlechter, weil er laenger bekannt ist.
-- =============================================================================

-- --- Die Verfallsdaten aus dem Bestand nehmen ------------------------------
--
-- Die Spalte bleibt. Es kann Inhalte geben, die wirklich ein Enddatum
-- haben (eine Aktion, eine Frist) - nur ist "Nachricht" keiner davon.
update public.content_items
   set expires_at = null
 where expires_at is not null;


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
  v_n_news  int;
  v_n_know  int;
  v_repeats int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;

  v_langs := public.user_feed_languages(v_user);
  v_n_news := greatest(1, (p_batch_size * 4) / 10);
  v_n_know := greatest(1, p_batch_size - v_n_news);
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
           -- --- Alter ------------------------------------------------
           --
           -- Frueher stand hier eine Kurve fuer alle Inhalte. Jetzt
           -- unterscheidet sie, weil sich Nachrichten und Wissen im Alter
           -- unterschiedlich verhalten:
           --
           --   news       verliert schnell an Wert, faellt aber nur bis
           --              auf 0.06 - nicht auf null. Eine Meldung von
           --              letztem Monat ist nicht wertlos, sie ist nur
           --              selten dran. Ohne diesen Boden waere
           --              "historische Nachrichten anzeigen" eine
           --              Behauptung ohne Wirkung.
           --   sonst      fester Wert. Zinseszins war letztes Jahr so
           --              richtig wie heute.
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
       -- Der Filter auf expires_at ist weg. Bewusst: was einmal geprueft
       -- und freigegeben wurde, bleibt abrufbar. Veraltet ist eine
       -- Eigenschaft, die man anschreibt, kein Grund zum Loeschen.
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
       and not (ci.id = any(p_exclude))
  ),
  fresh as (select * from pool where not already_seen),
  picked as (
    (select content_id from fresh where content_type = 'news'
      order by score desc limit v_n_news)
    union
    (select content_id from fresh where content_type in ('knowledge','interactive')
      order by score desc limit v_n_know)
  ),
  repeats as (
    select content_id
      from pool
     where already_seen
       and content_id not in (select content_id from picked)
     order by last_seen_at asc nulls first
     limit case when (select count(*) from picked) = 0 then p_batch_size else v_repeats end
  )
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

grant execute on function public.get_feed(int, uuid[]) to authenticated;
