-- =============================================================================
-- 0028_kinetic_demo_content.sql  ·  Fuenf Erklaerkarten von Hand
--
-- Warum das eine Migration ist und kein Seed
-- ------------------------------------------
-- Seeds werden in diesem Projekt von Hand im SQL-Editor eingespielt (siehe
-- docs/SETUP.md). Fuer Konfiguration und Kategorien ist das richtig: einmal
-- beim Aufsetzen, danach nie wieder.
--
-- Diese Karten sind etwas anderes. Sie gehoeren zu der Schema-Aenderung, die
-- das Format ueberhaupt erst eingefuehrt hat (0027) - ohne sie ist die
-- Spalte da und der Feed leer. Eine Funktion, deren einzige Daten man
-- separat von Hand nachtragen muss, ist eine halb ausgelieferte Funktion.
--
-- `on conflict (content_hash) do nothing` macht es beliebig oft wiederholbar.
-- =============================================================================

insert into public.content_items (
  content_type, presentation_mode, status, title, deck, body_blocks,
  source_ids, source_urls, primary_source_id, published_at,
  language, region_code, primary_category_id, category_ids,
  difficulty, word_count, quiz_items, media, kinetic_script, content_hash
) values

-- === 1 · Zinseszins ==========================================================
-- Das Beispiel, an dem sich das Format beweisen muss: eine Zahl, die wachsen
-- muss, damit man begreift, worum es geht.
('knowledge','kinetic','approved',
 'Was Zinseszins wirklich macht',
 'Zehn Jahre, 1.000 Euro, 6 Prozent - und ein Unterschied, den kaum jemand schaetzt.',
 '[{"type":"para","text":"Bei einfachem Zins bekommst du jedes Jahr 6 Prozent vom Startkapital: 60 Euro, immer gleich. Beim Zinseszins bekommst du 6 Prozent von allem, was schon da ist - auch von den Zinsen der Vorjahre."},
   {"type":"stat","value":"1.791 € statt 1.600 €","label":"nach 10 Jahren, aus 1.000 Euro bei 6 Prozent"},
   {"type":"para","text":"Nach zehn Jahren sind das 191 Euro Unterschied. Nach vierzig Jahren wird aus demselben Startkapital 10.286 statt 3.400 Euro - der Abstand waechst nicht gleichmaessig, sondern immer schneller."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now() - interval '4 hours',
 'de', null, 'finance.compound', array['finance.compound','finance.basics'],
 2, 96,
 '[{"question":"Wie viel mehr bringt Zinseszins gegenueber einfachem Zins nach 10 Jahren bei 1.000 Euro und 6 Prozent?","options":["191 Euro","600 Euro","60 Euro"],"correct_index":0,"explanation":"1.791 minus 1.600 sind 191 Euro."}]'::jsonb,
 '{"demo": true}'::jsonb,
 '{"beats":[
   {"say":"Du legst tausend Euro an, zu sechs Prozent im Jahr.",
    "show":{"kind":"statement","text":"1.000 €","sub":"zu 6 % pro Jahr"}},
   {"say":"Nach einem Jahr sind es tausendsechzig.",
    "show":{"kind":"table","id":"z","head":["Jahr","Guthaben"],"rows":[["1","1.060 €"]]}},
   {"say":"Im zweiten Jahr bekommst du sechs Prozent auf diese tausendsechzig - nicht mehr auf tausend.",
    "show":{"kind":"table","id":"z","head":["Jahr","Guthaben"],"rows":[["1","1.060 €"],["2","1.124 €"]]}},
   {"say":"Der Zuwachs wird jedes Jahr groesser, ohne dass du etwas tust.",
    "show":{"kind":"table","id":"z","head":["Jahr","Guthaben"],"rows":[["1","1.060 €"],["2","1.124 €"],["3","1.191 €"],["4","1.262 €"]]}},
   {"say":"Nach zehn Jahren stehen tausendsiebenhunderteinundneunzig Euro da.",
    "show":{"kind":"table","id":"z","head":["Jahr","Guthaben"],"rows":[["1","1.060 €"],["2","1.124 €"],["3","1.191 €"],["4","1.262 €"],["10","1.791 €"]]}},
   {"say":"Mit einfachem Zins waeren es nur sechzehnhundert gewesen.",
    "show":{"kind":"bars","id":"v","unit":"€","labels":["einfacher Zins","Zinseszins"],"values":[1600,1791],"baseline":1000}},
   {"say":"Nach vierzig Jahren wird aus demselben Einsatz zehntausend statt dreitausendvierhundert.",
    "show":{"kind":"bars","id":"v","unit":"€","labels":["einfacher Zins","Zinseszins"],"values":[3400,10286],"baseline":1000}},
   {"say":"Das ist der ganze Unterschied: Zeit arbeitet nicht linear, sondern gegen dich oder fuer dich.",
    "show":{"kind":"statement","text":"10.286 €","sub":"nach 40 Jahren - aus 1.000 Euro"}}
 ]}'::jsonb,
 'demo-de-kinetic-compound'),

-- === 2 · Verteiltes Lernen ===================================================
-- Zwei Balken, die dasselbe Zeitbudget vergleichen. Der Punkt ist der
-- Groessenunterschied, und den sieht man, statt ihn zu lesen.
('knowledge','kinetic','approved',
 'Dieselbe Stunde, doppelt so viel behalten',
 'Warum vier mal fuenfzehn Minuten schlagen, was eine Stunde am Stueck nicht schafft.',
 '[{"type":"para","text":"Der Spacing-Effekt ist einer der am besten belegten Befunde der Lernforschung: Derselbe Zeitaufwand, ueber mehrere Tage verteilt, fuehrt zu deutlich besserem Langzeitbehalten als am Stueck."},
   {"type":"para","text":"Der Haken ist, dass Blockpauken sich besser anfuehlt. Waehrend man lernt, laeuft es fluessiger - und diese Fluessigkeit wird mit Behalten verwechselt. Verteiltes Lernen fuehlt sich muehsamer an und wirkt besser."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Verteiltes_Lernen'], 'internal-de', now() - interval '6 hours',
 'de', null, 'mind.learning', array['mind.learning','mind.focus'],
 2, 84,
 '[{"question":"Warum unterschaetzen viele das verteilte Lernen?","options":["Weil es insgesamt laenger dauert","Weil Blockpauken sich fluessiger anfuehlt","Weil man dabei weniger Stoff schafft"],"correct_index":1,"explanation":"Fluessigkeit im Moment wird mit Behalten verwechselt."}]'::jsonb,
 '{"demo": true}'::jsonb,
 '{"beats":[
   {"say":"Zwei Leute lernen denselben Stoff, beide genau eine Stunde.",
    "show":{"kind":"statement","text":"60 Minuten","sub":"gleicher Stoff, gleiche Zeit"}},
   {"say":"Die eine lernt eine Stunde am Stueck.",
    "show":{"kind":"table","id":"p","head":["Plan","Verteilung"],"rows":[["am Stueck","60 min an einem Tag"]]}},
   {"say":"Die andere teilt sie auf vier Tage zu je fuenfzehn Minuten.",
    "show":{"kind":"table","id":"p","head":["Plan","Verteilung"],"rows":[["am Stueck","60 min an einem Tag"],["verteilt","4 × 15 min an 4 Tagen"]]}},
   {"say":"Direkt danach gefragt, koennen beide ungefaehr gleich viel.",
    "show":{"kind":"bars","id":"b","unit":"%","labels":["am Stueck","verteilt"],"values":[85,84]}},
   {"say":"Eine Woche spaeter sieht es voellig anders aus.",
    "show":{"kind":"bars","id":"b","unit":"%","labels":["am Stueck","verteilt"],"values":[35,68]}},
   {"say":"Derselbe Aufwand, fast doppelt so viel im Kopf.",
    "show":{"kind":"statement","text":"68 % statt 35 %","sub":"behalten nach einer Woche"}},
   {"say":"Und der Grund, warum es kaum jemand macht: verteiltes Lernen fuehlt sich muehsamer an.",
    "show":{"kind":"statement","text":"Es fuehlt sich schlechter an","sub":"genau daran erkennt man, dass es wirkt"}}
 ]}'::jsonb,
 'demo-de-kinetic-spacing'),

-- === 3 · Lichtlaufzeit =======================================================
-- Eine Tabelle, deren Zeilen um Groessenordnungen auseinanderliegen. Genau
-- dafuer ist die wachsende Tabelle da.
('news','kinetic','approved',
 'Wie alt das Licht ist, das du siehst',
 'Vom Handybildschirm bis zur Andromeda-Galaxie - in Sekunden und in Jahren.',
 '[{"type":"para","text":"Licht legt rund 300.000 Kilometer pro Sekunde zurueck. Das ist so schnell, dass es auf der Erde praktisch keine Rolle spielt - und im Weltall alles bestimmt."},
   {"type":"bullet","items":["Vom Mond: 1,3 Sekunden","Von der Sonne: 8 Minuten 20 Sekunden","Vom naechsten Stern: 4,2 Jahre","Von der Andromeda-Galaxie: 2,5 Millionen Jahre"]},
   {"type":"para","text":"Jeder Blick nach oben ist damit ein Blick in die Vergangenheit. Beim Mond um eine Sekunde, bei Andromeda um laenger, als es Menschen gibt."}]'::jsonb,
 array['internal-de'], array['https://www.esa.int'], 'internal-de', now() - interval '8 hours',
 'de', null, 'science.space', array['science.space','science.physics'],
 2, 92,
 '[{"question":"Wie lange braucht Sonnenlicht bis zur Erde?","options":["8 Sekunden","8 Minuten","8 Stunden"],"correct_index":1,"explanation":"Rund 8 Minuten und 20 Sekunden."}]'::jsonb,
 '{"demo": true}'::jsonb,
 '{"beats":[
   {"say":"Licht ist das Schnellste, was es gibt: dreihunderttausend Kilometer in einer Sekunde.",
    "show":{"kind":"statement","text":"300.000 km/s","sub":"schneller geht es nicht"}},
   {"say":"Vom Mond zu dir braucht es etwas mehr als eine Sekunde.",
    "show":{"kind":"table","id":"l","head":["Von wo","Wie lange"],"rows":[["Mond","1,3 Sekunden"]]}},
   {"say":"Von der Sonne acht Minuten und zwanzig Sekunden.",
    "show":{"kind":"table","id":"l","head":["Von wo","Wie lange"],"rows":[["Mond","1,3 Sekunden"],["Sonne","8 min 20 s"]]}},
   {"say":"Vom naechsten Stern nach der Sonne schon vier Jahre.",
    "show":{"kind":"table","id":"l","head":["Von wo","Wie lange"],"rows":[["Mond","1,3 Sekunden"],["Sonne","8 min 20 s"],["Proxima Centauri","4,2 Jahre"]]}},
   {"say":"Und von der Andromeda-Galaxie zweieinhalb Millionen Jahre.",
    "show":{"kind":"table","id":"l","head":["Von wo","Wie lange"],"rows":[["Mond","1,3 Sekunden"],["Sonne","8 min 20 s"],["Proxima Centauri","4,2 Jahre"],["Andromeda","2.500.000 Jahre"]]}},
   {"say":"Das heisst: Du siehst Andromeda so, wie sie aussah, bevor es Menschen gab.",
    "show":{"kind":"statement","text":"2,5 Mio. Jahre","sub":"aelter als unsere Art"}},
   {"say":"Nach oben zu schauen ist kein Blick in die Ferne, sondern in die Vergangenheit.",
    "show":{"kind":"figure","seed":"light-time","caption":"Jeder Punkt am Himmel zeigt eine andere Zeit"}}
 ]}'::jsonb,
 'demo-de-kinetic-lightlag'),

-- === 4 · Compound interest (EN) ==============================================
('knowledge','kinetic','approved',
 'The chessboard problem',
 'One grain on the first square, doubling each time. It ends badly for the king.',
 '[{"type":"para","text":"A legend has an inventor asking for one grain of rice on the first square of a chessboard, two on the second, four on the third, doubling all the way to the sixty-fourth."},
   {"type":"stat","value":"18 quintillion grains","label":"on the last square alone"},
   {"type":"para","text":"That is more rice than has been grown in all of human history. The point is not the rice - it is that doubling starts slow enough to look harmless and ends beyond anything you can picture."}]'::jsonb,
 array['internal-en'], array['https://en.wikipedia.org/wiki/Wheat_and_chessboard_problem'], 'internal-en', now() - interval '5 hours',
 'en', null, 'finance.compound', array['finance.compound','world.science'],
 2, 88,
 '[{"question":"Why is the chessboard story used to explain exponential growth?","options":["Because the numbers stay small","Because it starts slow and ends beyond imagining","Because rice was valuable"],"correct_index":1,"explanation":"The first squares look harmless, the last ones are astronomical."}]'::jsonb,
 '{"demo": true}'::jsonb,
 '{"beats":[
   {"say":"One grain of rice on the first square of a chessboard.",
    "show":{"kind":"statement","text":"1 grain","sub":"square one"}},
   {"say":"Two on the second, four on the third. Doubling every time.",
    "show":{"kind":"table","id":"c","head":["Square","Grains"],"rows":[["1","1"],["2","2"],["3","4"]]}},
   {"say":"By square ten you are still only at five hundred grains. A handful.",
    "show":{"kind":"table","id":"c","head":["Square","Grains"],"rows":[["1","1"],["2","2"],["3","4"],["10","512"]]}},
   {"say":"By square twenty, a million. This is where it stops looking harmless.",
    "show":{"kind":"table","id":"c","head":["Square","Grains"],"rows":[["1","1"],["2","2"],["3","4"],["10","512"],["20","1 048 576"]]}},
   {"say":"By square forty, a million million.",
    "show":{"kind":"table","id":"c","head":["Square","Grains"],"rows":[["10","512"],["20","1 048 576"],["40","549 755 813 888"]]}},
   {"say":"On the sixty-fourth square alone: eighteen quintillion grains.",
    "show":{"kind":"statement","text":"18 000 000 000 000 000 000","sub":"grains on the final square"}},
   {"say":"More rice than humanity has ever grown - from one grain and one rule.",
    "show":{"kind":"bars","id":"g","unit":"","labels":["square 32","square 48","square 64"],"values":[4,262144,17179869184]}}
 ]}'::jsonb,
 'demo-en-kinetic-chessboard'),

-- === 5 · Sleep (EN) ==========================================================
('knowledge','kinetic','approved',
 'What a late night actually costs',
 'Going to bed two hours later does not cut two hours evenly.',
 '[{"type":"para","text":"Sleep is not one uniform state. Deep sleep dominates the first half of the night, REM sleep the second half - and REM is when most memory consolidation happens."},
   {"type":"para","text":"That is why a shortened night is not proportionally shortened. Cutting the last two hours removes mostly REM, which is the part learning depends on the most."}]'::jsonb,
 array['internal-en'], array['https://en.wikipedia.org/wiki/Rapid_eye_movement_sleep'], 'internal-en', now() - interval '9 hours',
 'en', null, 'body.sleep', array['body.sleep','mind.learning'],
 2, 76,
 '[{"question":"Which sleep stage is lost most when a night is cut short at the end?","options":["Deep sleep","REM sleep","Both equally"],"correct_index":1,"explanation":"REM is concentrated in the second half of the night."}]'::jsonb,
 '{"demo": true}'::jsonb,
 '{"beats":[
   {"say":"A full night is about eight hours.",
    "show":{"kind":"statement","text":"8 hours","sub":"a full night"}},
   {"say":"Deep sleep happens mostly in the first half.",
    "show":{"kind":"bars","id":"s","unit":"min","labels":["first half","second half"],"values":[95,25]}},
   {"say":"REM sleep is the opposite: most of it comes at the end.",
    "show":{"kind":"bars","id":"s2","unit":"min","labels":["first half","second half"],"values":[30,90]}},
   {"say":"So cutting two hours off the end does not remove a quarter of everything.",
    "show":{"kind":"table","id":"t","head":["What you lose","How much"],"rows":[["of the night","25 %"]]}},
   {"say":"It removes more than half of your REM sleep.",
    "show":{"kind":"table","id":"t","head":["What you lose","How much"],"rows":[["of the night","25 %"],["of your REM sleep","over 50 %"]]}},
   {"say":"And REM is the stage your memory depends on most.",
    "show":{"kind":"statement","text":"Memory lives in REM","sub":"the part a short night takes first"}}
 ]}'::jsonb,
 'demo-en-kinetic-sleep')

on conflict (content_hash) do nothing;
