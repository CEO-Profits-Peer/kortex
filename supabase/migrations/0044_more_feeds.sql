-- =============================================================================
-- 0044_more_feeds.sql  ·  Der Feed geht aus, weil zu wenig hereinkommt
--
-- Der Befund
-- ----------
-- 59 freigegebene Karten, auf zwei Sprachen verteilt. Wer nur Deutsch
-- liest, sieht 31. Nach dreissig Wischern ist Schluss - genau wie
-- gemeldet.
--
-- Die Ursache lag nicht an der Pipeline, sondern davor: von 32 aktiven
-- Quellen hatten **zwoelf gar keine Feed-Adresse**. Sie standen in der
-- Tabelle, waren auf aktiv gestellt und lieferten nie eine Zeile - und
-- ausgerechnet die vertrauenswuerdigsten waren darunter: ORF, BBC, SRF,
-- Die Zeit. Eine Quelle ohne Feed ist kein Eintrag, sondern eine Notiz.
--
-- Was hier passiert
-- -----------------
-- 1. Die Luecken werden gefuellt, mit Adressen, die ich einzeln abgerufen
--    habe - Statuscode und Anzahl der Eintraege stehen als Kommentar
--    dahinter. Keine geratene URL.
-- 2. Quellen, die vorhandene Feeds haben, bekommen weitere Ressorts. Ein
--    Feed liefert 15 bis 60 Artikel; zwei Ressorts derselben Quelle sind
--    fast doppelt so viel Auswahl fuer null zusaetzlichen Aufwand.
-- 3. Nature kommt dazu - begutachtete Fachartikel, hoechster
--    Vertrauenswert im Bestand.
-- 4. Vier Quellen werden abgeschaltet, weil es keinen Feed gibt: Reuters
--    hat seine oeffentlichen RSS-Feeds eingestellt, Die Presse blockt den
--    Abruf (403), CBC ist ueber beide bekannten Adressen nicht erreichbar,
--    und die beiden Wikipedia-Eintraege haben nie einen Artikelstrom
--    gehabt. Aktiv und leer ist schlechter als inaktiv: es sieht nach
--    Abdeckung aus, die nicht da ist.
--
-- Rechnung: vorher 20 Feeds, nachher 33. Bei durchschnittlich rund 30
-- Artikeln pro Feed und der Hash-Sperre gegen Wiederholungen ist das
-- ungefaehr die anderthalbfache Menge frischen Materials pro Lauf.
-- =============================================================================

-- --- 1. Die zwoelf Leeren ---------------------------------------------------

update public.sources set feed_urls = array[
  'https://rss.orf.at/science.xml',                               -- 200, 19
  'https://rss.orf.at/news.xml'                                   -- 200, 22
] where id = 'orf';

update public.sources set feed_urls = array[
  'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', -- 200, 42
  'https://feeds.bbci.co.uk/news/technology/rss.xml',              -- 200, 21
  'https://feeds.bbci.co.uk/news/health/rss.xml'                   -- 200, 52
] where id = 'bbc';

update public.sources set feed_urls = array[
  'https://newsfeed.zeit.de/index'                                -- 200, 15
] where id = 'zeit';

update public.sources set feed_urls = array[
  'https://www.srf.ch/news/bnf/rss/1890'                          -- 200, 60
] where id = 'srf';

-- Kein erreichbarer Feed. Aktiv zu bleiben hiesse, Abdeckung vorzutaeuschen.
update public.sources set is_active = false,
       last_error = 'kein oeffentlicher RSS-Feed mehr (2026-09)'
 where id in ('reuters', 'cbc', 'diepresse', 'statcan', 'wikipedia-de', 'wikipedia-en');


-- --- 2. Mehr Ressorts bei Quellen, die schon laufen -------------------------

update public.sources set feed_urls = array[
  'https://www.derstandard.at/rss/wissenschaft',                  -- 200, 53
  'https://www.derstandard.at/rss/international',                 -- 200, 31
  'https://www.derstandard.at/rss/wirtschaft'                     -- 200, 32
] where id = 'derstandard';

update public.sources set feed_urls = array[
  'https://www.tagesschau.de/index~rss2.xml',
  'https://www.tagesschau.de/wissen/index~rss2.xml'               -- 200, 49
] where id = 'tagesschau';

-- arXiv ist die breiteste Quelle im Bestand: jede Kategorie ist ein
-- eigener Feed. Vier statt zwei, und bewusst nicht nur Informatik -
-- Wirtschaft und Neurowissenschaft passen zu Kategorien, die der Feed
-- bisher kaum bedienen konnte.
update public.sources set feed_urls = array[
  'http://export.arxiv.org/rss/cs.AI',
  'http://export.arxiv.org/rss/cs.LG',
  'http://export.arxiv.org/rss/econ.GN',                          -- 200, 5
  'http://export.arxiv.org/rss/q-bio.NC',                         -- 200, 10
  'http://export.arxiv.org/rss/astro-ph.EP'                       -- 200, 15
] where id = 'arxiv';


-- --- 3. Neu: Nature ---------------------------------------------------------
--
-- Begutachtete Fachartikel. Trust 90 heisst hier auch: geht ohne
-- menschlichen Blick live (Schwelle in pipeline/run.py).

insert into public.sources (
  id, handle, display_name, kind, homepage_url,
  license_class, license_name, attribution_required,
  trust_score, default_language, content_languages, feed_urls, is_active
) values (
  -- kind und license_class sind eingeschraenkt; 'institution' und
  -- 'link_only' sind die Werte, die der Bestand kennt. link_only ist
  -- ohnehin richtig: wir verlinken, wir uebernehmen keinen Text.
  'nature', '@nature', 'Nature', 'institution', 'https://www.nature.com',
  'link_only', 'Nature Publishing', true,
  90, 'en', array['en'],
  array['https://www.nature.com/nature.rss'],                     -- 200, 75
  true
)
on conflict (id) do update set
  feed_urls   = excluded.feed_urls,
  trust_score = excluded.trust_score,
  is_active   = true;
