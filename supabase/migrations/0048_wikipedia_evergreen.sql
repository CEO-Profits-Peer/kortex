-- =============================================================================
-- 0048_wikipedia_evergreen.sql  ·  Wikipedia als Quelle fuer Evergreen-Karten
--
-- Warum Wikipedia wieder angeschaltet wird
-- ----------------------------------------
-- In 0044 habe ich die beiden Wikipedia-Eintraege deaktiviert, weil sie
-- keine Feed-Adresse hatten und deshalb nie etwas lieferten. Das war
-- richtig fuer den Nachrichtenlauf und falsch fuer alles andere:
-- Wikipedia braucht keinen Feed, es braucht eine Themenliste
-- (pipeline/topics.py, 150 geprueste Lemmas).
--
-- Und es ist die einzige breite Quelle, die `cc` ist. Das ist der
-- entscheidende Unterschied: ORF, BBC, Zeit, Standard, Nature sind alle
-- `link_only`, weshalb rund 60 Prozent aller geholten Artikel weggeworfen
-- werden, bevor die Pipeline ueberhaupt anfaengt. Bei CC-BY-SA ist
-- Volltextverarbeitung erlaubt, solange die Quelle genannt wird - und
-- `attribution_required` steht bei beiden ohnehin schon auf true.
--
-- Der Vertrauenswert: 70 -> 80. Das ist eine Wertung, keine Formalie.
-- ------------------------------------------------------------------
-- Ab 80 geht eine Karte ohne menschlichen Blick live (Schwelle in
-- pipeline/run.py). Heute Vormittag habe ich mich ausdruecklich
-- GEWEIGERT, diese Schwelle zu senken, um schneller an Karten zu kommen -
-- dabei waeren Gin-Pressemitteilungen im Feed gelandet. Warum hier
-- trotzdem eine Anhebung, und warum das nicht dasselbe ist:
--
--   * Damals sollte die SCHWELLE runter, also fuer alle Quellen. Hier
--     wird EINE Quelle neu bewertet, die fuer diesen Zweck nie bewertet
--     wurde: die 70 stammen aus der Zeit, als Wikipedia ein Platzhalter
--     ohne Feed war.
--   * Der Pruefer ist hier am staerksten. Die deterministische Pruefung
--     vergleicht jede Zahl und jeden Eigennamen der Karte mit dem
--     Referenztext - und bei Evergreen IST der Referenztext der Artikel,
--     ueber den die Karte geht. Bei einer Pressemitteilung prueft sie
--     nur, ob die Karte die Mitteilung korrekt wiedergibt; ob die
--     Mitteilung stimmt, kann sie nicht wissen.
--   * Die Themen sind von Hand ausgesucht. "Zinseszins" und
--     "Gewaltenteilung" sind keine strittigen Artikel.
--
-- Trotzdem eine Wertung, und zwar meine. Die ersten Karten gehoeren
-- angesehen. Zurueck geht es mit einer Zahl: trust_score auf 70, dann
-- landet alles wieder auf 'pending'.
-- =============================================================================

update public.sources
   set is_active   = true,
       last_error  = null,
       trust_score = 80,
       -- Ohne Feed, mit Absicht: die Themenliste in pipeline/topics.py
       -- ersetzt ihn. Damit taucht die Quelle im Nachrichtenlauf nicht
       -- auf (der ueberspringt alles ohne Feed) und nur in evergreen.py.
       feed_urls   = '{}'
 where id in ('wikipedia-de', 'wikipedia-en');
