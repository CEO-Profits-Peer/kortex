-- =============================================================================
-- 0008_feed_urls.sql
--
-- Die Pipeline muss wissen, WO sie bei jeder Quelle abholt. Bisher stand in
-- sources nur die Homepage.
--
-- Warum in der Datenbank und nicht in einer Konfigurationsdatei: eine neue
-- Quelle hinzuzufuegen soll ein INSERT sein, kein Deploy. Und die Pipeline
-- laeuft in GitHub Actions - je weniger dort fest verdrahtet ist, desto
-- besser.
-- =============================================================================

alter table public.sources
  add column if not exists feed_urls text[] not null default '{}',
  -- Nach welcher Kategorie die Karten dieser Quelle standardmaessig laufen,
  -- wenn Gemini keine bessere zuordnen kann.
  add column if not exists default_category_id text references public.categories(id),
  add column if not exists last_fetched_at timestamptz,
  add column if not exists last_error text,
  add column if not exists fetch_interval_minutes int not null default 60;

create index if not exists sources_fetchable_idx on public.sources (last_fetched_at)
  where is_active and array_length(feed_urls, 1) > 0;


-- =============================================================================
-- Feeds eintragen
--
-- Nur Quellen mit license_class 'cc' oder 'press_free' bekommen einen Feed:
-- bei 'link_only' duerfen wir ohnehin nur Titel und Link speichern, dafuer
-- lohnt der Abruf in v1 noch nicht.
-- =============================================================================

update public.sources set feed_urls = v.urls, default_category_id = v.cat
from (values
  -- --- Deutsch, press_free ---------------------------------------------------
  ('apa-ots',      array['https://www.ots.at/rss/'],                                    'local.at'),
  ('bka-at',       array['https://www.bundeskanzleramt.gv.at/service/rss.html'],        'local.at'),
  ('eu-kom-de',    array['https://ec.europa.eu/commission/presscorner/api/rss?language=de'], 'world.politics'),
  ('idw',          array['https://nachrichten.idw-online.de/rss.php'],                  'world.science'),
  ('mpg',          array['https://www.mpg.de/feeds/news.rss'],                          'world.science'),
  -- --- Deutsch, cc -----------------------------------------------------------
  ('wikinews-de',  array['https://de.wikinews.org/w/index.php?title=Spezial:Letzte_%C3%84nderungen&feed=rss'], 'world.politics'),
  ('statistik-at', array['https://www.statistik.at/fileadmin/announcement/rss.xml'],    'local.at'),
  -- --- Englisch, press_free --------------------------------------------------
  ('nasa',         array['https://www.nasa.gov/news-release/feed/'],                    'science.space'),
  ('esa',          array['https://www.esa.int/rssfeed/Our_Activities/Space_Science'],   'science.space'),
  ('eurekalert',   array['https://www.eurekalert.org/rss/technology_engineering.xml',
                         'https://www.eurekalert.org/rss/medicine_health.xml'],         'world.science'),
  ('eu-kom-en',    array['https://ec.europa.eu/commission/presscorner/api/rss?language=en'], 'world.politics'),
  ('europarl',     array['https://www.europarl.europa.eu/rss/doc/top-stories/en.xml'],  'world.politics'),
  ('canada-gov',   array['https://api.io.canada.ca/io-server/gc/news/en/v2?format=atom'], 'local.ca'),
  ('cern',         array['https://home.cern/api/news/news/feed.rss'],                   'science.physics'),
  -- --- Englisch, cc ----------------------------------------------------------
  ('wikinews-en',  array['https://en.wikinews.org/w/index.php?title=Special:RecentChanges&feed=rss'], 'world.politics'),
  ('arxiv',        array['http://export.arxiv.org/rss/cs.AI', 'http://export.arxiv.org/rss/cs.LG'],   'tech.ai'),
  ('biorxiv',      array['https://connect.biorxiv.org/biorxiv_xml.php?subject=neuroscience'],         'science.neuro')
) as v(id, urls, cat)
where public.sources.id = v.id;
