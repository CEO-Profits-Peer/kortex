-- =============================================================================
-- 0045_drop_wrong_sources.sql  ·  Drei Quellen, die nicht in diese App gehoeren
--
-- Warum das hier steht, obwohl es Material WEGNIMMT, waehrend eigentlich
-- mehr gebraucht wird
-- -------------------------------------------------------------------------
-- Im Rueckstau lagen 29 fertig geprüfte Karten. Auf dem Papier waren das
-- 29 Karten geschenkt. Ich habe sie gelesen, bevor ich sie freigebe - und
-- danach diese Datei geschrieben. Das ist eine Auswahl davon:
--
--   APA-OTS   "Micro Spirits: Eine neue Getraenkekategorie"
--             "Uebernahme von ECOMEDCLEAN durch SALESIANER"
--             "Erntedankfest am Wiener Heldenplatz"
--   arXiv     "Reliability-Aware Pair Importance Distillation"
--             "Damage-Aware Bandit Pruning"
--             "Multi-Granularity Hypergraph Representation Learning"
--   bioRxiv   "Arx mutations and neurodevelopmental disorders"
--
-- APA-OTS ist ein Presseaussendungsdienst. Was dort liegt, ist nicht
-- Nachricht, sondern Mitteilung - eine Firma sagt etwas ueber sich selbst.
-- Fuer eine Lern-App ist das die falsche Gattung, unabhaengig von der
-- Qualitaet der Pruefung.
--
-- arXiv und bioRxiv liefern Abstracts von Fachaufsaetzen, geschrieben von
-- Fachleuten fuer Fachleute. "Damage-Aware Bandit Pruning" ist fuer die
-- Zielgruppe keine Karte, sondern eine Zumutung - und auch keine
-- gesicherte Erkenntnis: beides sind Preprint-Server, es gibt keine
-- Begutachtung.
--
-- Der eigentliche Befund ist unangenehmer: dass diese Karten ueberhaupt
-- entstanden sind. Die Vertrauensschwelle (>= 80) hat sie zurueckgehalten,
-- nicht die inhaltliche Pruefung - die Schwelle hat also stillschweigend
-- Arbeit gemacht, fuer die sie nicht gedacht war. Haette ich sie, wie
-- zuerst geplant, auf 70 gesenkt, um "schnell 29 Karten mehr" zu haben,
-- waeren Gin-Pressemitteilungen im Feed gelandet.
--
-- Nature ersetzt den Anspruch, der hinter arXiv stand: begutachtete
-- Forschung, aber redaktionell aufbereitet (siehe 0044).
--
-- Rueckgaengig zu machen ist es mit einer Zeile: is_active wieder auf true.
-- =============================================================================

update public.sources
   set is_active = false,
       last_error = 'Gattung passt nicht: Presseaussendungen statt Nachrichten'
 where id = 'apa-ots';

update public.sources
   set is_active = false,
       last_error = 'Preprint-Abstracts, nicht begutachtet und nicht zielgruppentauglich'
 where id in ('arxiv', 'biorxiv');


-- --- Der Rueckstau wird abgeraeumt -----------------------------------------
--
-- 'pending' heisst "wartet auf einen Menschen". Diese 29 warten auf
-- niemanden mehr - sie liegen zu lassen hiesse, sich eine Reserve
-- vorzumachen, die keine ist.

update public.content_items
   set status = 'rejected',
       reject_reason = 'Quelle abgeschaltet (0045): Pressemitteilung bzw. Fachabstract'
 where status = 'pending'
   and primary_source_id in ('apa-ots', 'arxiv', 'biorxiv');
