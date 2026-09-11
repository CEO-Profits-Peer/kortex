-- =============================================================================
-- 0031_fix_category_feed.sql  ·  Der Kategorie-Feed hat nie funktioniert
--
-- Was man sah
-- -----------
-- Kategorie oeffnen, "Feed starten" tippen - und es passiert nichts.
-- Genauer: es stand "Feed konnte nicht geladen werden", was auf einem
-- dunklen Hintergrund niemand als Fehlermeldung liest.
--
-- Die falsche Faehrte (0030)
-- --------------------------
-- Mein erster Verdacht war ein veralteter Zeilentyp: `content_items` hat
-- 2018 like_count und 2027 kinetic_script dazubekommen, und Funktionen mit
-- `returns setof content_items` koennten die alte Form festhalten. 0030
-- legt deshalb alle betroffenen Funktionen neu an.
--
-- Das war falsch. Es hat den Fehler nicht behoben, und die Funktionen
-- waren auch nicht veraltet. 0030 ist dadurch wirkungslos, aber harmlos -
-- es legt jede Funktion mit ihrer eigenen, unveraenderten Definition neu
-- an.
--
-- Die tatsaechliche Ursache
-- -------------------------
-- Im Rumpf steht:
--
--     candidates as (
--       select ci.*, ... as tier, ... as already_seen, s.last_seen_at
--         from public.content_items ci ...
--     )
--     select (c).* from (select c from candidates c order by ... ) t(c);
--
-- `candidates` ist content_items PLUS drei Hilfsspalten fuer die Sortierung.
-- `(c).*` klappt die ganze Zeile auf - also mitsamt der drei. Die Funktion
-- verspricht `setof content_items` und liefert drei Spalten mehr:
--
--     42804  Number of returned columns (35) does not match expected (32)
--
-- Das ist kein Folgefehler einer spaeteren Aenderung. Der Kategorie-Feed
-- hat seit seiner Einfuehrung in 0015 nie funktioniert - es hat nur nie
-- jemand darauf getippt.
--
-- Die Behebung
-- ------------
-- Dieselbe Form wie in get_feed: erst die IDs in der gewuenschten
-- Reihenfolge ermitteln, dann auf die Tabelle zurueckverbinden und `ci.*`
-- ausgeben. Damit stimmt die Spaltenzahl per Konstruktion und kann durch
-- keine kuenftige Hilfsspalte wieder kaputtgehen.
--
-- Die Sortierung wandert dabei nach aussen. Ohne das waere sie nach dem
-- Verbinden verloren - ein Feed in zufaelliger Reihenfolge faellt beim
-- Testen nicht auf, im Gebrauch schon.
-- =============================================================================

create or replace function public.get_category_feed(
  p_category_id  text,
  p_batch_size   int default 10,
  p_include_read boolean default false
) returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_p      public.profiles;
  v_langs  text[];
  v_parent text;
  v_pref   int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;
  v_langs := public.user_feed_languages(v_user);

  select parent_id into v_parent from public.categories where id = p_category_id;

  select coalesce(max(difficulty_pref), 2) into v_pref
    from public.user_categories
   where user_id = v_user and category_id = p_category_id;

  return query
  with branch as (
    select c.id from public.categories c
     where c.id = p_category_id or c.parent_id = p_category_id
  ),
  -- Nachbarschaft: Geschwister unter demselben Elternknoten. Damit laeuft
  -- der Feed weiter, wenn das enge Thema erschoepft ist.
  neighbourhood as (
    select c.id from public.categories c
     where v_parent is not null
       and (c.parent_id = v_parent or c.id = v_parent)
       and c.id not in (select id from branch)
  ),
  seen as (
    select content_id, last_seen_at from public.user_content_state
     where user_id = v_user and is_read_validated
  ),
  -- Nur noch das, was zum Sortieren gebraucht wird - keine ganzen Zeilen.
  -- Genau daran ist die alte Fassung gescheitert.
  candidates as (
    select ci.id,
           case
             when ci.primary_category_id in (select id from branch)        then 0
             when ci.primary_category_id in (select id from neighbourhood) then 1
             else 2
           end as tier,
           (s.content_id is not null) as already_seen,
           ci.difficulty,
           s.last_seen_at,
           coalesce(ci.published_at, ci.created_at) as at
      from public.content_items ci
      left join seen s on s.content_id = ci.id
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and ci.content_type <> 'course_lesson'
       and (ci.expires_at is null or ci.expires_at > now())
  ),
  picked as (
    select * from candidates
     order by
       -- Erst das Thema, dann die Nachbarschaft, dann alles Uebrige.
       tier asc,
       -- Innerhalb jeder Stufe: Ungelesenes zuerst.
       (already_seen and not p_include_read) asc,
       -- Passende Schwierigkeit vor unpassender.
       abs(difficulty - v_pref) asc,
       last_seen_at asc nulls first,
       at desc
     limit p_batch_size
  )
  select ci.*
    from picked p
    join public.content_items ci on ci.id = p.id
   -- Dieselbe Reihenfolge noch einmal: ein JOIN gibt keine Garantie, und
   -- ohne diese Zeile kaeme der Feed in zufaelliger Ordnung heraus.
   order by
     p.tier asc,
     (p.already_seen and not p_include_read) asc,
     abs(p.difficulty - v_pref) asc,
     p.last_seen_at asc nulls first,
     p.at desc;
end
$fn$;

grant execute on function public.get_category_feed(text, int, boolean) to authenticated;
