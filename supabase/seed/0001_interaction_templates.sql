-- =============================================================================
-- Die 10 Interaktions-Templates.
--
-- Kernidee: Das Template ist handgeschriebener React-Native-Code. Die KI
-- erfindet KEINE Interaktion - sie fuellt nur das json_schema aus. Damit
-- skaliert Interaktivitaet mit der Pipeline statt mit unserer Arbeitszeit.
--
-- Jedes Schema hat 'reveal_after_ms': der Regler/das Puzzle erscheint erst,
-- nachdem der Nutzer den Kontext gelesen hat - nicht sofort.
-- =============================================================================

insert into public.interaction_templates (id, display_name, description, base_xp, base_mastery, json_schema) values

('timeline_sort', 'Zeitstrahl sortieren',
 'Ereignisse in die richtige chronologische Reihenfolge ziehen. Fuer Geschichte, Politik, Wissenschaftsgeschichte.',
 30, 12, '{
  "type":"object","required":["prompt","events","reveal_after_ms"],
  "properties":{
    "prompt":{"type":"string"},
    "reveal_after_ms":{"type":"integer","default":3000},
    "events":{"type":"array","minItems":3,"maxItems":5,"items":{
      "type":"object","required":["label","order"],
      "properties":{"label":{"type":"string","maxLength":80},
                    "detail":{"type":"string"},
                    "order":{"type":"integer"}}}}}}'::jsonb),

('estimate_slider', 'Schaetzen',
 'Nutzer schaetzt eine Zahl auf einem Regler, danach wird der wahre Wert eingeblendet. Erzeugt einen Aha-Moment durch die eigene Fehleinschaetzung.',
 30, 12, '{
  "type":"object","required":["question","min","max","answer","unit","reveal_after_ms"],
  "properties":{
    "question":{"type":"string"},
    "reveal_after_ms":{"type":"integer","default":2000},
    "min":{"type":"number"},"max":{"type":"number"},
    "step":{"type":"number","default":1},
    "answer":{"type":"number"},
    "tolerance_pct":{"type":"number","default":15},
    "unit":{"type":"string"},
    "log_scale":{"type":"boolean","default":false},
    "reveal_text":{"type":"string"}}}'::jsonb),

('parameter_slider', 'Regler & Kurve',
 'Nutzer bewegt einen Parameter, ein Graph reagiert live. Der Zinseszins-Fall. Fuer alles mit Formel: Wachstum, Zinsen, Halbwertszeit, Statistik.',
 35, 15, '{
  "type":"object","required":["prompt","param","formula","axes","reveal_after_ms"],
  "properties":{
    "prompt":{"type":"string"},
    "reveal_after_ms":{"type":"integer","default":3000},
    "param":{"type":"object","required":["key","label","min","max","default"],
      "properties":{"key":{"type":"string"},"label":{"type":"string"},
                    "min":{"type":"number"},"max":{"type":"number"},
                    "step":{"type":"number","default":1},"default":{"type":"number"},
                    "unit":{"type":"string"}}},
    "formula":{"type":"string","description":"Sichere Teilmenge: x, param, + - * / ^ ( ) exp log sqrt"},
    "axes":{"type":"object","properties":{
      "x_label":{"type":"string"},"y_label":{"type":"string"},
      "x_min":{"type":"number"},"x_max":{"type":"number"}}},
    "checkpoint":{"type":"object","description":"Frage, die nach dem Spielen erscheint",
      "properties":{"question":{"type":"string"},
                    "target_param":{"type":"number"},
                    "tolerance":{"type":"number"}}}}}'::jsonb),

('match_pairs', 'Zuordnen',
 'Begriffe links mit Definitionen/Folgen rechts verbinden. Node-Snapping mit Federphysik.',
 30, 14, '{
  "type":"object","required":["prompt","pairs","reveal_after_ms"],
  "properties":{
    "prompt":{"type":"string"},
    "reveal_after_ms":{"type":"integer","default":2500},
    "pairs":{"type":"array","minItems":3,"maxItems":5,"items":{
      "type":"object","required":["left","right"],
      "properties":{"left":{"type":"string","maxLength":40},
                    "right":{"type":"string","maxLength":60},
                    "explanation":{"type":"string"}}}},
    "distractors":{"type":"array","items":{"type":"string"},"maxItems":2}}}'::jsonb),

('hotspot_reveal', 'Schichten freilegen',
 'Auf Bereiche eines Diagramms tippen, um Ebenen aufzudecken. Fuer Anatomie, Architektur, Systemdiagramme, Karten.',
 25, 10, '{
  "type":"object","required":["prompt","canvas","hotspots"],
  "properties":{
    "prompt":{"type":"string"},
    "canvas":{"type":"object","required":["svg_ref","view_box"],
      "properties":{"svg_ref":{"type":"string"},"view_box":{"type":"string"}}},
    "hotspots":{"type":"array","minItems":2,"maxItems":6,"items":{
      "type":"object","required":["x","y","label","detail"],
      "properties":{"x":{"type":"number"},"y":{"type":"number"},
                    "r":{"type":"number","default":24},
                    "label":{"type":"string"},"detail":{"type":"string"}}}},
    "require_all":{"type":"boolean","default":true}}}'::jsonb),

('true_false_swipe', 'Stimmt / Stimmt nicht',
 'Aussagen nach links oder rechts wischen. Nutzt dieselbe Geste wie der Feed - null Lernkurve, hohes Tempo.',
 25, 12, '{
  "type":"object","required":["prompt","statements","reveal_after_ms"],
  "properties":{
    "prompt":{"type":"string"},
    "reveal_after_ms":{"type":"integer","default":1500},
    "statements":{"type":"array","minItems":3,"maxItems":6,"items":{
      "type":"object","required":["text","is_true"],
      "properties":{"text":{"type":"string","maxLength":120},
                    "is_true":{"type":"boolean"},
                    "explanation":{"type":"string"}}}}}}'::jsonb),

('fill_blank', 'Luecke fuellen',
 'Fehlendes Wort oder fehlende Zahl aus Optionen waehlen. Der guenstigste Test fuer praezises Verstaendnis.',
 20, 10, '{
  "type":"object","required":["sentence_before","sentence_after","options","correct_index"],
  "properties":{
    "sentence_before":{"type":"string"},
    "sentence_after":{"type":"string"},
    "options":{"type":"array","minItems":2,"maxItems":4,"items":{"type":"string"}},
    "correct_index":{"type":"integer"},
    "explanation":{"type":"string"}}}'::jsonb),

('rank_order', 'Groessen ordnen',
 'Dinge nach Groesse/Menge/Haeufigkeit ordnen. Deckt Fehleinschaetzungen von Groessenordnungen auf.',
 30, 14, '{
  "type":"object","required":["prompt","criterion","items","reveal_after_ms"],
  "properties":{
    "prompt":{"type":"string"},
    "criterion":{"type":"string","description":"z.B. \"von am meisten zu am wenigsten CO2\""},
    "reveal_after_ms":{"type":"integer","default":2500},
    "items":{"type":"array","minItems":3,"maxItems":5,"items":{
      "type":"object","required":["label","value","unit"],
      "properties":{"label":{"type":"string"},"value":{"type":"number"},
                    "unit":{"type":"string"}}}}}}'::jsonb),

('branch_choice', 'Entscheidung & Folge',
 'Nutzer trifft eine Entscheidung, sieht die Konsequenz, entscheidet erneut. Fuer Ethik, Wirtschaft, Politik, Verhandlungen.',
 40, 18, '{
  "type":"object","required":["scenario","nodes","start"],
  "properties":{
    "scenario":{"type":"string"},
    "start":{"type":"string"},
    "nodes":{"type":"array","minItems":3,"maxItems":8,"items":{
      "type":"object","required":["id","text"],
      "properties":{"id":{"type":"string"},"text":{"type":"string"},
        "is_terminal":{"type":"boolean","default":false},
        "outcome_quality":{"type":"string","enum":["good","mixed","poor"]},
        "choices":{"type":"array","maxItems":3,"items":{
          "type":"object","required":["label","next"],
          "properties":{"label":{"type":"string"},"next":{"type":"string"},
                        "consequence":{"type":"string"}}}}}}}}}'::jsonb),

('build_sequence', 'Ablauf bauen',
 'Bausteine zu einem funktionierenden Ablauf zusammensetzen. Fuer Code, Logik, Prozesse, Rezepte, Beweise.',
 40, 18, '{
  "type":"object","required":["prompt","blocks","reveal_after_ms"],
  "properties":{
    "prompt":{"type":"string"},
    "reveal_after_ms":{"type":"integer","default":3000},
    "language_hint":{"type":"string","description":"z.B. python - fuer Syntax-Highlighting"},
    "blocks":{"type":"array","minItems":3,"maxItems":7,"items":{
      "type":"object","required":["text","order"],
      "properties":{"text":{"type":"string"},"order":{"type":"integer"},
                    "indent":{"type":"integer","default":0},
                    "is_decoy":{"type":"boolean","default":false}}}},
    "result_text":{"type":"string","description":"Was der fertige Ablauf ausgibt/bewirkt"}}}'::jsonb)

on conflict (id) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  json_schema  = excluded.json_schema,
  base_xp      = excluded.base_xp,
  base_mastery = excluded.base_mastery;
