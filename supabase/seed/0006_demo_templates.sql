-- =============================================================================
-- DEMO: die sieben neu gebauten Interaktions-Templates
--
-- Eine Karte pro Template, damit sich alle im Feed ansehen lassen.
-- Wie 0003-0005 handgeschrieben und mit {"demo": true} markiert.
--
-- Nicht dabei: hotspot_reveal - das braucht als einziges echte Diagramm-
-- Dateien und damit einen Grafik-Arbeitsablauf, den es noch nicht gibt.
-- =============================================================================

insert into public.content_items (
  content_type, presentation_mode, status, title, deck, body_blocks,
  source_ids, source_urls, primary_source_id, published_at,
  language, region_code, primary_category_id, category_ids,
  difficulty, word_count, interaction_template, interaction_data,
  quiz_items, media, content_hash
) values

-- === parameter_slider ·  das Vorzeigebeispiel ================================
('interactive','interactive','approved',
 'Zieh den Regler, sieh die Kurve',
 'Zinseszins ist nicht schwer zu rechnen — schwer ist, ihn sich vorzustellen.',
 '[{"type":"para","text":"1000 Euro Startkapital. Der Regler bestimmt den Zinssatz, die Kurve zeigt 30 Jahre Entwicklung. Beweg ihn langsam von 1 auf 10 Prozent."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now() - interval '1 day',
 'de', null, 'finance.compound', array['finance.compound'],
 3, 38, 'parameter_slider',
 '{"prompt":"1000 Euro über 30 Jahre",
   "param":{"key":"p","label":"Zinssatz pro Jahr","min":1,"max":12,"step":0.5,"default":3,"unit":"%"},
   "formula":"1000 * (1 + p / 100) ^ x",
   "axes":{"x_label":"Jahre","y_label":"Euro","x_min":0,"x_max":30},
   "checkpoint":{"question":"Stell 7 % ein: nach 30 Jahren ist aus 1000 Euro das Siebenfache geworden.","target_param":7,"tolerance":0.5},
   "reveal_after_ms":3500}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-param'),

-- === timeline_sort ===========================================================
('interactive','interactive','approved',
 'Vier Schritte zum Internet',
 'Die Reihenfolge überrascht die meisten.',
 '[{"type":"para","text":"Das Internet entstand nicht auf einmal. Vier Entwicklungen bauten aufeinander auf — aber nicht in der Reihenfolge, die man vermutet."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Geschichte_des_Internets'], 'internal-de', now() - interval '2 days',
 'de', null, 'tech.code', array['tech.code','world.science'],
 2, 34, 'timeline_sort',
 '{"prompt":"Bring die vier Entwicklungen in die richtige Reihenfolge.",
   "reveal_after_ms":3000,
   "items":[
     {"label":"ARPANET geht in Betrieb","order":1,"detail":"1969"},
     {"label":"E-Mail mit dem @-Zeichen","order":2,"detail":"1971"},
     {"label":"TCP/IP wird Standard","order":3,"detail":"1983"},
     {"label":"World Wide Web","order":4,"detail":"1989"}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-timeline'),

-- === rank_order ==============================================================
('interactive','interactive','approved',
 'Was wiegt schwerer?',
 'Größenordnungen schätzt fast niemand richtig ein.',
 '[{"type":"para","text":"Vier Dinge, die alle Energie speichern. Aber wie viel, pro Kilogramm? Der Abstand zwischen ihnen ist größer, als man denkt."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Energiedichte'], 'internal-de', now() - interval '3 days',
 'de', null, 'science.physics', array['science.physics','tech.hardware'],
 3, 36, 'rank_order',
 '{"prompt":"Ordne nach Energiedichte pro Kilogramm.",
   "criterion":"Vom höchsten zum niedrigsten Wert",
   "reveal_after_ms":3000,
   "items":[
     {"label":"Wasserstoff","order":1,"detail":"120 MJ/kg"},
     {"label":"Benzin","order":2,"detail":"46 MJ/kg"},
     {"label":"Steinkohle","order":3,"detail":"30 MJ/kg"},
     {"label":"Lithium-Ionen-Akku","order":4,"detail":"0,9 MJ/kg"}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-rank'),

-- === build_sequence ==========================================================
('interactive','interactive','approved',
 'Bau die Schleife',
 'Fünf Zeilen, eine richtige Reihenfolge — und ein Baustein, der nicht dazugehört.',
 '[{"type":"para","text":"Ein Programm, das die Zahlen 1 bis 5 aufsummiert. Die Zeilen sind durcheinander, und eine davon gehört gar nicht dazu."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Schleife_(Programmierung)'], 'internal-de', now() - interval '1 day',
 'de', null, 'tech.code', array['tech.code'],
 2, 35, 'build_sequence',
 '{"prompt":"Bring die Zeilen in die richtige Reihenfolge.",
   "language_hint":"python",
   "result_text":"Ausgabe: 15",
   "reveal_after_ms":3000,
   "items":[
     {"label":"summe = 0","order":1},
     {"label":"for i in range(1, 6):","order":2},
     {"label":"    summe = summe + i","order":3,"indent":1},
     {"label":"print(summe)","order":4},
     {"label":"import random","order":99,"is_decoy":true}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-sequence'),

-- === match_pairs =============================================================
('interactive','interactive','approved',
 'Denkfehler zuordnen',
 'Vier Verzerrungen, vier Alltagssituationen.',
 '[{"type":"para","text":"Kognitive Verzerrungen sind leichter zu erkennen, wenn man sie an konkreten Situationen sieht statt an Definitionen."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Kognitive_Verzerrung'], 'internal-de', now() - interval '4 days',
 'de', null, 'mind.bias', array['mind.bias'],
 3, 32, 'match_pairs',
 '{"prompt":"Ordne jedem Denkfehler die passende Situation zu.",
   "reveal_after_ms":2500,
   "pairs":[
     {"left":"Bestätigungsfehler","right":"Du liest nur Quellen, die deiner Meinung entsprechen.",
      "explanation":"Belege für die eigene Position werden milder geprüft."},
     {"left":"Verfügbarkeitsheuristik","right":"Nach einem Flugzeugabsturz in den Nachrichten wirkt Fliegen gefährlicher.",
      "explanation":"Was leicht erinnerbar ist, wirkt häufiger."},
     {"left":"Ankereffekt","right":"Der durchgestrichene Originalpreis lässt den Rabatt größer wirken.",
      "explanation":"Die erste Zahl prägt alle folgenden Urteile."},
     {"left":"Rückschaufehler","right":"Nach dem Spiel war das Ergebnis angeblich vorhersehbar.",
      "explanation":"Im Nachhinein wirkt alles zwangsläufig."}],
   "distractors":["Du rechnest im Kopf schneller als mit dem Taschenrechner."]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-match'),

-- === fill_blank ==============================================================
('interactive','interactive','approved',
 'Ein Wort fehlt',
 'Der Unterschied zwischen ungefähr richtig und genau richtig.',
 '[{"type":"para","text":"Bei der Photosynthese wandeln Pflanzen Lichtenergie in chemische Energie um. Der Ausgangsstoff wird dabei oft verwechselt."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Photosynthese'], 'internal-de', now() - interval '2 days',
 'de', null, 'science.bio', array['science.bio'],
 2, 30, 'fill_blank',
 '{"sentence_before":"Bei der Photosynthese stammt der freigesetzte Sauerstoff aus dem ",
   "sentence_after":", nicht aus dem Kohlendioxid.",
   "options":["Wasser","Zucker","Chlorophyll"],
   "correct_index":0,
   "explanation":"Das Wassermolekül wird gespalten. Der Kohlenstoff aus dem CO₂ landet im Zucker."}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-blank'),

-- === branch_choice ===========================================================
('interactive','interactive','approved',
 'Du hast 500 Euro gespart',
 'Es gibt keine eine richtige Antwort. Nur Folgen.',
 '[{"type":"para","text":"Geldentscheidungen sind selten eindeutig richtig oder falsch. Sie haben Folgen, und die zeigen sich erst später."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Notgroschen'], 'internal-de', now() - interval '5 days',
 'de', null, 'finance.basics', array['finance.basics'],
 3, 33, 'branch_choice',
 '{"scenario":"Du hast 500 Euro gespart und keine Rücklagen. Was machst du damit?",
   "start":"start",
   "nodes":[
     {"id":"start","text":"500 Euro auf dem Konto. Kein Notgroschen, kein Schuldenstand.",
      "choices":[
        {"label":"Alles in Aktien anlegen","next":"aktien","consequence":"Du legst alles an."},
        {"label":"Als Notgroschen liegen lassen","next":"notgroschen","consequence":"Du behältst das Geld verfügbar."},
        {"label":"Neues Handy kaufen","next":"handy","consequence":"Du gibst es aus."}]},
     {"id":"aktien","text":"Drei Monate später geht dein Laptop kaputt. Der Markt steht gerade 15 Prozent im Minus.",
      "choices":[
        {"label":"Mit Verlust verkaufen","next":"verlust","consequence":"Du verkaufst im Tief."},
        {"label":"Laptop auf Raten kaufen","next":"raten","consequence":"Du nimmst einen Ratenkredit."}]},
     {"id":"verlust","text":"Du hast 75 Euro Verlust realisiert. Genau dafür gibt es den Notgroschen: damit man nie zum schlechtesten Zeitpunkt verkaufen muss.",
      "is_terminal":true,"outcome_quality":"poor"},
     {"id":"raten","text":"Der Ratenkredit kostet dich mehr Zinsen, als die Aktien im Schnitt bringen. Die Anlage war nicht falsch — nur die Reihenfolge.",
      "is_terminal":true,"outcome_quality":"mixed"},
     {"id":"notgroschen","text":"Drei Monate später geht dein Laptop kaputt. Du zahlst bar, ohne Kredit und ohne etwas verkaufen zu müssen. Erst der Notgroschen macht Anlegen überhaupt sinnvoll.",
      "is_terminal":true,"outcome_quality":"good"},
     {"id":"handy","text":"Das Handy ist schön. Beim nächsten unerwarteten Betrag stehst du ohne Puffer da — und Dispozinsen liegen deutlich über jeder Rendite.",
      "is_terminal":true,"outcome_quality":"poor"}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-tpl-branch')

on conflict (content_hash) do nothing;
