-- =============================================================================
-- DEMO: interaktive Karten
--
-- Zeigt die zwei gebauten Templates. Wie bei 0003 handgeschrieben und mit
-- {"demo": true} markiert - spaeter fuellt die Pipeline interaction_data
-- gegen das json_schema aus interaction_templates.
--
-- reveal_after_ms ist der Kern deiner Idee: der Regler erscheint erst, wenn
-- der Kontext gelesen sein kann. Sofort sichtbar waere es ein Spielzeug,
-- verzoegert ist es eine Pruefung dessen, was man gerade gelesen hat.
-- =============================================================================

insert into public.content_items (
  content_type, presentation_mode, status, title, deck, body_blocks,
  source_ids, source_urls, primary_source_id, published_at,
  language, region_code, primary_category_id, category_ids,
  difficulty, word_count, interaction_template, interaction_data,
  quiz_items, media, content_hash
) values

-- === estimate_slider ========================================================

('interactive','interactive','approved',
 'Wie schnell verdoppelt sich Geld?',
 'Erst schätzen, dann rechnen. Die eigene Fehleinschätzung bleibt hängen.',
 '[{"type":"para","text":"Bei Zinseszins wächst Geld nicht linear, sondern multiplikativ. Genau das unterschätzen fast alle - auch Leute, die die Formel kennen."},
   {"type":"para","text":"Schätze: Du legst Geld zu 7 Prozent jährlich an. Nach wie vielen Jahren hat es sich verdoppelt?"}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now() - interval '2 days',
 'de', null, 'finance.compound', array['finance.compound'],
 2, 55, 'estimate_slider',
 '{"question":"Jahre bis zur Verdopplung bei 7 % Zinsen",
   "min":1,"max":40,"step":1,"answer":10,"tolerance_pct":15,"unit":"Jahre",
   "reveal_after_ms":3500,
   "reveal_text":"Die 72er-Regel: 72 geteilt durch den Zinssatz. 72 ÷ 7 ≈ 10,3 Jahre."}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-ix-de-compound'),

('interactive','interactive','approved',
 'Wie alt ist das Sonnenlicht?',
 'Zwischen Sonne und Auge liegt eine messbare Verzögerung.',
 '[{"type":"para","text":"Licht ist schnell, aber nicht unendlich schnell. Rund 300.000 Kilometer legt es pro Sekunde zurück."},
   {"type":"para","text":"Zwischen Sonne und Erde liegen etwa 150 Millionen Kilometer. Schätze, wie lange das Licht für diese Strecke braucht."}]'::jsonb,
 array['internal-de'], array['https://www.esa.int'], 'internal-de', now() - interval '3 days',
 'de', null, 'science.space', array['science.space'],
 1, 52, 'estimate_slider',
 '{"question":"Laufzeit des Sonnenlichts bis zur Erde",
   "min":1,"max":60,"step":1,"answer":8,"tolerance_pct":20,"unit":"Minuten",
   "reveal_after_ms":3000,
   "reveal_text":"8 Minuten und 20 Sekunden. Was du siehst, ist immer Vergangenheit."}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-ix-de-light'),

('interactive','interactive','approved',
 'How much of a battery is lost as heat?',
 'Efficiency numbers are less intuitive than they look.',
 '[{"type":"para","text":"A modern lithium-ion cell does not return all the energy you put into it. Some is lost as heat on the way in, some on the way out."},
   {"type":"para","text":"Estimate the round-trip efficiency of a typical lithium-ion battery: of the energy that goes in, how much comes back out?"}]'::jsonb,
 array['internal-en'], array['https://en.wikipedia.org/wiki/Lithium-ion_battery'], 'internal-en', now() - interval '2 days',
 'en', null, 'tech.hardware', array['tech.hardware'],
 3, 58, 'estimate_slider',
 '{"question":"Round-trip efficiency of a lithium-ion cell",
   "min":40,"max":100,"step":1,"answer":90,"tolerance_pct":8,"unit":"%",
   "reveal_after_ms":3000,
   "reveal_text":"Around 90 %. Pumped hydro sits near 80 %, hydrogen well below 50 %."}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-ix-en-battery'),

-- === true_false_swipe =======================================================

('interactive','interactive','approved',
 'Vier Behauptungen über Schlaf',
 'Wisch nach rechts, wenn es stimmt. Nach links, wenn nicht.',
 '[{"type":"para","text":"Der Schlaf läuft in Zyklen von etwa 90 Minuten. Tiefschlaf überwiegt in der ersten Nachthälfte, REM-Schlaf in der zweiten."},
   {"type":"para","text":"Wer zu spät ins Bett geht und trotzdem zur gleichen Zeit aufsteht, verliert deshalb vor allem REM-Schlaf."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Schlaf'], 'internal-de', now() - interval '1 day',
 'de', null, 'body.sleep', array['body.sleep','mind.focus'],
 2, 54, 'true_false_swipe',
 '{"prompt":"Stimmt das?","reveal_after_ms":3000,
   "statements":[
     {"text":"Ein Schlafzyklus dauert ungefähr 90 Minuten.","is_true":true,
      "explanation":"Steht direkt im Text."},
     {"text":"Tiefschlaf ist gleichmäßig über die ganze Nacht verteilt.","is_true":false,
      "explanation":"Er überwiegt in der ersten Nachthälfte."},
     {"text":"Wer zu spät ins Bett geht, verliert vor allem REM-Schlaf.","is_true":true,
      "explanation":"REM liegt überwiegend in der zweiten Nachthälfte."},
     {"text":"REM-Schlaf kommt hauptsächlich kurz nach dem Einschlafen.","is_true":false,
      "explanation":"Umgekehrt - REM nimmt gegen Morgen zu."}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-ix-de-sleep'),

('interactive','interactive','approved',
 'Vier Behauptungen über Zinsen',
 'Vier Aussagen. Zwei stimmen, zwei nicht.',
 '[{"type":"para","text":"Zinseszins bedeutet, dass Zinsen selbst wieder verzinst werden. Das Wachstum ist deshalb multiplikativ, nicht additiv."},
   {"type":"para","text":"Inflation folgt derselben Logik, nur in die andere Richtung: sie frisst Kaufkraft ebenfalls multiplikativ."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now() - interval '4 days',
 'de', null, 'finance.basics', array['finance.basics','finance.compound'],
 2, 51, 'true_false_swipe',
 '{"prompt":"Stimmt das?","reveal_after_ms":2500,
   "statements":[
     {"text":"Beim Zinseszins werden Zinsen selbst wieder verzinst.","is_true":true,
      "explanation":"Genau das ist die Definition."},
     {"text":"Zinseszins wächst additiv, also gleichmäßig pro Jahr.","is_true":false,
      "explanation":"Multiplikativ - das ist der ganze Unterschied."},
     {"text":"Inflation wirkt über lange Zeiträume multiplikativ.","is_true":true,
      "explanation":"Dieselbe Rechnung, negatives Vorzeichen."},
     {"text":"Inflation trifft nur Bargeld, keine Guthaben.","is_true":false,
      "explanation":"Sie senkt die Kaufkraft jedes nominalen Betrags."}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-ix-de-interest'),

('interactive','interactive','approved',
 'Four claims about binary search',
 'Swipe right if true, left if false.',
 '[{"type":"para","text":"Binary search discards half of the remaining candidates with every step. Doubling the size of the data adds exactly one step."},
   {"type":"para","text":"The catch is that the data has to be sorted first, which is why databases keep indexes instead of sorting on every query."}]'::jsonb,
 array['internal-en'], array['https://en.wikipedia.org/wiki/Binary_search'], 'internal-en', now() - interval '2 days',
 'en', null, 'tech.code', array['tech.code'],
 3, 56, 'true_false_swipe',
 '{"prompt":"True or false?","reveal_after_ms":2500,
   "statements":[
     {"text":"Doubling the data adds one step, not twice the steps.","is_true":true,
      "explanation":"Logarithmic growth."},
     {"text":"Binary search works on unsorted data.","is_true":false,
      "explanation":"Sorting is the precondition."},
     {"text":"Databases keep indexes to avoid sorting on every query.","is_true":true,
      "explanation":"Stated in the text."},
     {"text":"Each step removes one candidate at a time.","is_true":false,
      "explanation":"It removes half of them."}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-ix-en-binsearch')

on conflict (content_hash) do nothing;
