-- =============================================================================
-- 0019_fix_feeds.sql  ·  Neun von neunzehn Feeds waren tot
--
-- Geprüft mit `python pipeline/check_feeds.py` — nicht geschätzt, sondern
-- jede URL einzeln abgerufen. Ergebnis:
--
--   TOT (HTTP 404): apa-ots, bka-at, idw, mpg, statistik-at,
--                   eurekalert (beide Feeds), cern
--   LEER:           europarl
--
-- Besonders bitter: Fast alle DEUTSCHEN Quellen waren dabei. Die Pipeline
-- hätte für Österreich praktisch nichts geliefert, und das wäre erst beim
-- ersten echten Lauf aufgefallen.
--
-- Was das über die Inhaltsstrategie sagt: Die frei lizenzierten deutschen
-- Quellen pflegen ihre Feeds schlecht, die urheberrechtlich geschützten
-- (Tagesschau, Standard, Nature) laufen tadellos. Genau die Spannung aus
-- docs/CONTENT-SOURCING.md — nur konkret geworden.
-- =============================================================================

-- --- Tote Quellen abschalten statt löschen ---------------------------------
-- Abschalten, nicht löschen: die Karten, die sie einmal geliefert haben,
-- brauchen ihre Quellenangabe weiterhin.
update public.sources
   set is_active = false,
       last_error = 'Feed liefert HTTP 404 (geprueft 2026-09-10)'
 where id in ('bka-at', 'idw', 'mpg', 'statistik-at', 'eurekalert', 'europarl');


-- --- Korrigierte URLs -------------------------------------------------------
update public.sources set feed_urls = v.urls, is_active = true, last_error = null
from (values
  -- APA-OTS hat keinen Sammelfeed mehr, aber Kategorie-Feeds funktionieren.
  ('apa-ots', array[
      'https://www.ots.at/rss/politik',
      'https://www.ots.at/rss/wirtschaft',
      'https://www.ots.at/rss/chronik']),
  ('cern',    array['https://home.cern/news/feed'])
) as v(id, urls)
where public.sources.id = v.id;


-- --- Ersatz für die deutschen Wissenschaftsquellen -------------------------
insert into public.sources
  (id, handle, display_name, kind, license_class, license_name, homepage_url,
   trust_score, default_region_code, default_language, feed_urls, default_category_id)
values
  ('bundesregierung', '@bundesregierung', 'Bundesregierung', 'institution',
   'press_free', 'Presseaussendung', 'https://www.bundesregierung.de', 80, 'DE', 'de',
   array['https://www.bundesregierung.de/service/rss/breg-de/1151244/feed.xml'],
   'world.politics'),

  ('esa-de', '@esa-de', 'ESA Deutschland', 'institution',
   'press_free', 'ESA Terms', 'https://www.esa.int', 85, null, 'de',
   array['https://www.esa.int/rssfeed/Germany'], 'science.space'),

  ('leibniz', '@leibniz', 'Leibniz-Gemeinschaft', 'institution',
   'press_free', 'Presseaussendung', 'https://www.leibniz-gemeinschaft.de', 85, null, 'de',
   array['https://www.leibniz-gemeinschaft.de/rss.xml'], 'world.science'),

  ('ista', '@ista', 'ISTA Klosterneuburg', 'institution',
   'press_free', 'Press Release', 'https://ista.ac.at', 85, 'AT', 'en',
   array['https://ista.ac.at/en/news/feed/'], 'world.science')

on conflict (id) do update set
  feed_urls = excluded.feed_urls,
  is_active = true,
  last_error = null;


-- =============================================================================
-- Zusätzliche link_only-Quellen
--
-- Diese Feeds laufen zuverlässig, sind aber urheberrechtlich geschützt. Sie
-- stehen hier eingetragen, damit die Pipeline sie NICHT anfasst
-- (may_store_fulltext ist bei link_only false) — und damit sie da sind,
-- falls später eine Titel-plus-Link-Darstellung dazukommt.
-- =============================================================================

insert into public.sources
  (id, handle, display_name, kind, license_class, homepage_url,
   trust_score, default_region_code, default_language, feed_urls, default_category_id)
values
  ('tagesschau', '@tagesschau', 'tagesschau', 'agency', 'link_only',
   'https://www.tagesschau.de', 85, 'DE', 'de',
   array['https://www.tagesschau.de/index~rss2.xml'], 'world.politics'),

  ('scinexx', '@scinexx', 'scinexx', 'agency', 'link_only',
   'https://www.scinexx.de', 72, null, 'de',
   array['https://www.scinexx.de/feed/'], 'world.science'),

  ('phys-org', '@physorg', 'Phys.org', 'agency', 'link_only',
   'https://phys.org', 75, null, 'en',
   array['https://phys.org/rss-feed/'], 'world.science'),

  ('sciencedaily', '@sciencedaily', 'ScienceDaily', 'agency', 'link_only',
   'https://www.sciencedaily.com', 72, null, 'en',
   array['https://www.sciencedaily.com/rss/all.xml'], 'world.science')

on conflict (id) do update set
  feed_urls = excluded.feed_urls,
  license_class = excluded.license_class;


-- --- Standard Wissenschaft als Feed hinterlegen (bleibt link_only) ---------
update public.sources
   set feed_urls = array['https://www.derstandard.at/rss/wissenschaft']
 where id = 'derstandard';


-- =============================================================================
-- Ein Sicherheitsnetz gegen riesige Feeds
--
-- Der kanadische Regierungsfeed liefert über 49.000 Einträge auf einmal.
-- Das ist nicht kaputt, nur sehr groß — die Pipeline nimmt ohnehin nur die
-- ersten paar, lädt aber jedes Mal alles herunter. Deshalb ein enger
-- gefasster Feed.
-- =============================================================================

update public.sources
   set feed_urls = array['https://api.io.canada.ca/io-server/gc/news/en/v2?format=atom&pick=25']
 where id = 'canada-gov';
