-- =============================================================================
-- DEMO-KURS  ·  "Zinseszins in 5 Lektionen"
--
-- Zeigt den Kurs-Modus. Lektionen sind content_items mit content_type
-- 'course_lesson' - damit tauchen sie NICHT einzeln im Feed auf
-- (get_feed filtert diesen Typ heraus), sondern nur in fester Reihenfolge.
--
-- Wie 0003 und 0004 handgeschrieben und mit {"demo": true} markiert.
-- =============================================================================

-- --- Lektionen ---------------------------------------------------------------

insert into public.content_items (
  content_type, presentation_mode, status, title, deck, body_blocks,
  source_ids, source_urls, primary_source_id, published_at,
  language, region_code, primary_category_id, category_ids,
  difficulty, word_count, interaction_template, interaction_data,
  quiz_items, media, content_hash
) values

('course_lesson','text','approved',
 'Warum Geld nicht linear wächst',
 'Lektion 1 · Der Unterschied zwischen addieren und multiplizieren.',
 '[{"type":"para","text":"Bei einfachem Zins bekommst du jedes Jahr denselben Betrag. Bei Zinseszins werden die Zinsen selbst wieder verzinst - das Wachstum beschleunigt sich also mit der Zeit."},
   {"type":"bullet","items":["Einfacher Zins: 100 Euro zu 10 Prozent geben jedes Jahr 10 Euro.","Zinseszins: im zweiten Jahr sind es 11 Euro, im dritten 12,10 Euro.","Der Unterschied wirkt anfangs winzig und wird später riesig."]}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now(),
 'de', null, 'finance.compound', array['finance.compound'],
 1, 66, null, null,
 '[{"question":"Was passiert beim Zinseszins mit den Zinsen?","options":["Sie werden ausgezahlt","Sie werden selbst wieder verzinst","Sie bleiben unverändert"],"correct_index":1,"explanation":"Genau das ist der Unterschied zum einfachen Zins."}]'::jsonb,
 '{"demo": true}'::jsonb, 'demo-course-zins-1'),

('course_lesson','text','approved',
 'Die Formel',
 'Lektion 2 · Drei Größen, ein Ergebnis.',
 '[{"type":"para","text":"Endkapital = Startkapital mal (1 plus Zinssatz) hoch Anzahl der Jahre."},
   {"type":"stat","value":"K = K₀ · (1 + p)ⁿ","label":"Die gesamte Zinseszinsrechnung"},
   {"type":"para","text":"Der Exponent ist der entscheidende Teil. Er sorgt dafür, dass sich Änderungen bei der Laufzeit stärker auswirken als Änderungen beim Zinssatz."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now(),
 'de', null, 'finance.compound', array['finance.compound'],
 2, 58, null, null,
 '[{"question":"Welcher Teil der Formel sorgt für das beschleunigte Wachstum?","options":["Das Startkapital","Der Exponent","Die Klammer"],"correct_index":1,"explanation":"Der Exponent macht aus Addition Multiplikation."}]'::jsonb,
 '{"demo": true}'::jsonb, 'demo-course-zins-2'),

('course_lesson','interactive','approved',
 'Selbst ausprobieren',
 'Lektion 3 · Schätze, bevor du rechnest.',
 '[{"type":"para","text":"Du kennst jetzt die Formel. Bevor wir sie anwenden: schätze zuerst. Die eigene Fehleinschätzung bleibt besser hängen als jede Rechnung."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Zinseszins'], 'internal-de', now(),
 'de', null, 'finance.compound', array['finance.compound'],
 2, 40, 'estimate_slider',
 '{"question":"1000 Euro, 5 % pro Jahr, 30 Jahre - wie viel am Ende?",
   "min":1000,"max":10000,"step":100,"answer":4322,"tolerance_pct":12,"unit":"Euro",
   "reveal_after_ms":3000,
   "reveal_text":"1000 · 1,05^30 = 4322 Euro. Mehr als das Vierfache, ohne einen Cent nachzulegen."}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-course-zins-3'),

('course_lesson','text','approved',
 'Die 72er-Regel',
 'Lektion 4 · Zinseszins im Kopf.',
 '[{"type":"para","text":"Teile 72 durch den Zinssatz in Prozent. Das Ergebnis sind ungefähr die Jahre bis zur Verdopplung."},
   {"type":"bullet","items":["Bei 6 Prozent: 72 geteilt durch 6 sind 12 Jahre.","Bei 9 Prozent: 8 Jahre.","Bei 2 Prozent: 36 Jahre."]},
   {"type":"para","text":"Die Regel ist eine Näherung und wird ungenauer, je weiter der Zinssatz von 8 Prozent entfernt liegt."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/72er-Regel'], 'internal-de', now(),
 'de', null, 'finance.compound', array['finance.compound'],
 2, 64, null, null,
 '[{"question":"Verdopplungszeit bei 4 Prozent?","options":["9 Jahre","18 Jahre","36 Jahre"],"correct_index":1,"explanation":"72 geteilt durch 4 sind 18."}]'::jsonb,
 '{"demo": true}'::jsonb, 'demo-course-zins-4'),

('course_lesson','interactive','approved',
 'Die andere Richtung',
 'Lektion 5 · Dieselbe Mathematik, negatives Vorzeichen.',
 '[{"type":"para","text":"Inflation funktioniert wie Zinseszins, nur rückwärts: sie senkt die Kaufkraft jedes Jahr um einen Prozentsatz des jeweils verbliebenen Betrags."}]'::jsonb,
 array['internal-de'], array['https://de.wikipedia.org/wiki/Inflation'], 'internal-de', now(),
 'de', null, 'finance.compound', array['finance.compound','finance.basics'],
 3, 42, 'true_false_swipe',
 '{"prompt":"Stimmt das?","reveal_after_ms":2500,
   "statements":[
     {"text":"Inflation wirkt multiplikativ, nicht additiv.","is_true":true,
      "explanation":"Dieselbe Logik wie beim Zinseszins."},
     {"text":"Bei 2 Prozent Inflation halbiert sich die Kaufkraft in 36 Jahren.","is_true":true,
      "explanation":"72 geteilt durch 2 sind 36 - die Regel gilt in beide Richtungen."},
     {"text":"Inflation betrifft nur Bargeld, nicht Guthaben.","is_true":false,
      "explanation":"Sie senkt die Kaufkraft jedes nominalen Betrags."},
     {"text":"Ein Zins unterhalb der Inflationsrate bedeutet realen Verlust.","is_true":true,
      "explanation":"Nominal mehr, real weniger."}]}'::jsonb,
 '[]'::jsonb, '{"demo": true}'::jsonb, 'demo-course-zins-5')

on conflict (content_hash) do nothing;


-- --- Kurs --------------------------------------------------------------------

insert into public.courses (slug, title, description, category_id, difficulty, language, is_published, cover)
values (
  'zinseszins',
  'Zinseszins in 5 Lektionen',
  'Warum kleine Prozentsätze über lange Zeiträume alles verändern — und wie du es im Kopf ausrechnest.',
  'finance.compound', 2, 'de', true,
  '{"motif":"wave"}'::jsonb
)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description, is_published = true;


-- --- Lektionen zuordnen ------------------------------------------------------

insert into public.course_lessons (course_id, position, content_id)
select c.id, v.pos, ci.id
  from public.courses c,
       (values (1, 'demo-course-zins-1'),
               (2, 'demo-course-zins-2'),
               (3, 'demo-course-zins-3'),
               (4, 'demo-course-zins-4'),
               (5, 'demo-course-zins-5')) as v(pos, hash)
  join public.content_items ci on ci.content_hash = v.hash
 where c.slug = 'zinseszins'
on conflict (course_id, position) do nothing;
