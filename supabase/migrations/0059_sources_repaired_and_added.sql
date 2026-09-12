-- =============================================================================
-- 0059_sources_repaired_and_added.sql  ·  Sechs tote Feeds, neun lebende
--
-- Der Befund
-- ----------
-- Von 39 Quellen waren 26 aktiv, davon 22 mit Feed - aber nur 12 mit
-- Volltextrecht. Die anderen 10 sind `link_only` und werden bei jedem Lauf
-- geholt, gezaehlt und weggeworfen (run.py, `skipped_license`).
--
-- Und sechs Quellen MIT Volltextrecht lagen still, alle mit demselben
-- Vermerk: "Feed liefert HTTP 404 (geprueft 2026-09-10)". Nicht die
-- Gattung stimmte nicht, nicht die Lizenz - nur die Adresse. Das ist der
-- billigste Nachschub, den es gibt: er war schon einmal ausgesucht.
--
-- Wie die richtigen Adressen gefunden wurden
-- -------------------------------------------
-- Zuerst geraten: 45 plausible Adressen ausprobiert, 3 haben funktioniert.
-- Das ist keine Methode, das ist Wuerfeln - Pressestellen bauen um, und
-- "/rss.xml" ist eine Konvention, keine Regel.
--
-- Dann richtig: die Startseite holen und im HTML nach
-- <link type="application/rss+xml"> suchen. So findet man die Adresse, die
-- der Anbieter selbst angibt. Von 28 Seiten kamen 15 brauchbare Feeds; 9
-- davon liefern auch Volltext, den trafilatura sauber herausloest.
--
-- Jeder Eintrag unten wurde einzeln geprueft: HTTP 200, Feed parsebar,
-- mindestens drei Eintraege, und der erste Artikel gab ueber 300 Woerter
-- sauberen Text her. Was das nicht schaffte, steht nicht in dieser Datei -
-- DLR, Statistics Canada und NSF liefern zwar eine Seite, aber null
-- Eintraege; NOAA gibt nur 75 Woerter pro Artikel her, zu wenig fuer eine
-- Karte.
--
-- Zur Lizenzeinstufung
-- --------------------
-- Alle neuen Quellen sind `press_free` nach der Tabelle in
-- docs/CONTENT-SOURCING.md ("Ministerien, EurekAlert-PMs, ESA/NASA"):
-- Pressemitteilungen von Forschungseinrichtungen und Behoerden, dieselbe
-- Gattung wie das schon vorhandene Leibniz und ISTA.
--
-- ESO veroeffentlicht seine Texte zusaetzlich unter CC BY 4.0 und koennte
-- damit `cc` sein. Es steht trotzdem auf `press_free`: technisch ist es
-- dasselbe Recht (may_store_fulltext), und eine Lizenz zu behaupten, die
-- ich nicht selbst nachgelesen habe, waere genau die Sorte Fehler, vor der
-- CONTENT-SOURCING warnt. Wer es nachprueft, kann eine Zeile aendern.
--
-- Zum Vertrauenswert von idw
-- ---------------------------
-- idw ist mit 345 Eintraegen der groesste Einzelfund und liefert genau
-- das, was auf der deutschen Seite fehlt. Es ist aber ein SAMMELDIENST:
-- dahinter stehen hunderte Hochschul-Pressestellen unterschiedlicher
-- Qualitaet. Deshalb 78 und nicht 85 - das liegt unter der Schwelle von
-- AUTO_APPROVE_MIN_TRUST (80, pipeline/run.py), die Karten warten also auf
-- einen Menschen.
--
-- Das ist bewusst so, und zwar wegen 0045: dort sind Gin-Pressemitteilungen
-- nur deshalb nicht im Feed gelandet, weil die Vertrauensschwelle
-- stillschweigend Arbeit gemacht hat, fuer die sie nicht gedacht war. Wer
-- fuenf idw-Karten gelesen hat und sie gut findet, stellt den Wert auf 80
-- und sie gehen von selbst live.
--
-- Was weiter fehlt
-- ----------------
-- AMS, Arbeiterkammer, WKO, Parlament und Sozialministerium haben KEINEN
-- RSS-Feed mehr - nachgeprueft, nicht vermutet. Das sind ausgerechnet die
-- Quellen fuer "AMS, Mietrecht, Pflichtschule", also fuer den Teil der
-- Zielgruppe, der am schlechtesten versorgt ist. Dafuer braeuchte es einen
-- zweiten Weg (HTML statt Feed) - oder man nimmt den, den es schon gibt:
-- die kuratierte Wikipedia-Liste in pipeline/topics.py.
-- =============================================================================

-- --- 1. Repariert: vier Adressen, die es noch gibt --------------------------

update public.sources
   set feed_urls = array['https://www.mpg.de/de/forschung.rss'],
       is_active = true,
       last_error = null
 where id = 'mpg';

update public.sources
   set feed_urls = array['https://idw-online.de/pages/de/pressreleasesrss'],
       is_active = true,
       trust_score = 78,
       last_error = null
 where id = 'idw';

-- Statistik Austria und das Bundeskanzleramt haben ihre Feeds ersatzlos
-- abgeschaltet; beide Seiten nennen im HTML keinen einzigen mehr. Sie
-- bleiben stillgelegt, damit der naechste Durchgang nicht wieder dieselben
-- vier Adressen durchprobiert.
update public.sources
   set last_error = 'kein RSS mehr auf der Seite (geprueft 2026-09-11, HTML durchsucht)'
 where id in ('statistik-at', 'bka-at', 'eurekalert', 'europarl');


-- --- 2. Ein zweiter Feed fuer die ESA ---------------------------------------
--
-- Erdbeobachtung statt nur Weltraumforschung: dieselbe Quelle, dieselbe
-- Lizenz, aber Themen, die naeher am Alltag liegen (Klima, Wetter, Meere).
-- Eine neue Quellenzeile waere falsch - die Karte soll "ESA" sagen, nicht
-- "ESA Erdbeobachtung".
update public.sources
   set feed_urls = feed_urls || array['https://www.esa.int/rssfeed/Our_Activities/Observing_the_Earth']
 where id = 'esa'
   and not ('https://www.esa.int/rssfeed/Our_Activities/Observing_the_Earth' = any(feed_urls));


-- --- 3. Neu: sieben Quellen -------------------------------------------------

insert into public.sources (
  id, handle, display_name, kind, homepage_url,
  license_class, license_name, attribution_required, trust_score,
  default_language, content_languages, default_region_code,
  default_category_id, feed_urls, is_active
) values
  -- Deutsch
  ('fraunhofer', '@fraunhofer', 'Fraunhofer-Gesellschaft', 'institution',
   'https://www.fraunhofer.de',
   'press_free', 'Presseinformation', true, 85,
   'de', array['de'], null, 'world.science',
   array['https://www.fraunhofer.de/de/rss/presse.rss'], true),

  ('uni-wien', '@univie', 'Universitaet Wien', 'institution',
   'https://www.univie.ac.at',
   'press_free', 'Pressemeldung', true, 82,
   'de', array['de'], 'AT', 'world.science',
   array['https://www.univie.ac.at/aktuelles/aktuelles-rss/feed.xml'], true),

  -- Die Bundesbank ist die einzige neue Quelle, die nicht Wissenschaft
  -- liefert, sondern Geld - und damit die Kategorie bedient, in der die
  -- App am duennsten aufgestellt ist. Pressenotizen, keine Fachaufsaetze.
  ('bundesbank', '@bundesbank', 'Deutsche Bundesbank', 'institution',
   'https://www.bundesbank.de',
   'press_free', 'Pressenotiz', true, 85,
   'de', array['de'], 'DE', 'finance.macro',
   array['https://www.bundesbank.de/service/rss/de/633286/feed.rss'], true),

  -- Englisch
  ('embl', '@embl', 'EMBL', 'institution',
   'https://www.embl.org',
   'press_free', 'Press release', true, 85,
   'en', array['en'], null, 'science.bio',
   array['https://www.embl.org/news/feed/'], true),

  ('eso', '@eso', 'European Southern Observatory', 'institution',
   'https://www.eso.org',
   'press_free', 'Press release', true, 85,
   'en', array['en'], null, 'science.space',
   array['https://feeds.feedburner.com/EsoTopNews'], true),

  -- Die beiden kanadischen: die Zielgruppe auf der englischen Seite sitzt
  -- in Kanada, und "TFSA, RRSP, Provinzen" stand von Anfang an im Konzept.
  -- Die FCAC ist die Behoerde, die genau dazu aufklaert - naeher kommt man
  -- der Zielgruppe mit einem Feed nicht.
  ('fcac-ca', '@fcac', 'Financial Consumer Agency of Canada', 'institution',
   'https://www.canada.ca/en/financial-consumer-agency.html',
   'press_free', 'Government of Canada news', true, 82,
   'en', array['en'], 'CA', 'finance.basics',
   array['https://api.io.canada.ca/io-server/gc/news/en/v2?dept=financialconsumeragency&sort=publishedDate&orderBy=desc&pick=50&format=atom'], true),

  ('bankofcanada', '@bankofcanada', 'Bank of Canada', 'institution',
   'https://www.bankofcanada.ca',
   'press_free', 'Press release', true, 85,
   'en', array['en'], 'CA', 'finance.macro',
   array['https://www.bankofcanada.ca/feed/?utility=news&post_type[0]=post&post_type[1]=page'], true)

on conflict (id) do update
   set feed_urls   = excluded.feed_urls,
       is_active   = true,
       trust_score = excluded.trust_score,
       last_error  = null;
