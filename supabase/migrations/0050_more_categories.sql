-- =============================================================================
-- 0050_more_categories.sql  ·  Achtzehn Kategorien mehr
--
-- Warum ueberhaupt mehr
-- ---------------------
-- Mehr Kategorien sind nicht nur mehr Auswahl im Onboarding. Sie sind die
-- Voraussetzung dafuer, dass die Themenliste wachsen kann: jede Karte
-- braucht eine Kategorie-ID, und ein Thema, fuer das es keine gibt, kann
-- man nicht aufnehmen. "Mietrecht" hatte bisher schlicht keinen Platz.
--
-- Ein neuer Oberpunkt: Alltag
-- ---------------------------
-- Die sieben bisherigen Oberpunkte sind Wissensgebiete - Technik,
-- Wissenschaft, Geld. Was fehlte, ist die Sorte Wissen, die man braucht,
-- ohne sich dafuer zu interessieren: Mietvertrag, Arbeitsvertrag,
-- Versicherung, Ruecktrittsrecht. Fuer siebzehn- bis fuenfundzwanzig-
-- jaehrige Leute ist das die Kategorie mit dem unmittelbarsten Nutzen,
-- und sie hat nirgends hineingepasst.
--
-- Farben
-- ------
-- Die Unterkategorien erben die Farbe ihres Oberpunkts - so ist es im
-- Bestand, und daran haengt die Wiedererkennung im Feed. Alltag bekommt
-- als einziger eine neue: ein gedecktes Gruengelb, das sich von den
-- sieben vorhandenen unterscheidet, ohne aus dem Blaupausen-Satz
-- auszubrechen.
--
-- is_levelable steht absichtlich nicht in der Spaltenliste: die Spalte
-- ist generiert (aus `kind`), und ein Schreibversuch endet mit
-- "cannot insert a non-DEFAULT value into column".
--
-- sort_order
-- ----------
-- Die bestehenden Oberpunkte liegen auf 10, 20, ... 70, ihre Kinder auf
-- +1, +2, +3. Neue Kinder haengen sich hinten an, damit sich die
-- Reihenfolge der vorhandenen nicht verschiebt - wer "Denkfehler" an
-- dritter Stelle gewohnt ist, soll es dort wiederfinden.
-- =============================================================================

-- --- Der neue Oberpunkt -----------------------------------------------------
insert into public.categories
  (id, slug, parent_id, display_name, emoji, accent_hex, kind, max_level, is_active, sort_order, name_i18n)
values
  ('life', 'alltag', null, 'Alltag & Recht', '📋', '#C8D94E', 'knowledge', 10, true, 75,
   '{"de":"Alltag & Recht","en":"Everyday & Rights"}'::jsonb)
on conflict (id) do nothing;


-- --- Alle neuen Unterkategorien ---------------------------------------------
insert into public.categories
  (id, slug, parent_id, display_name, emoji, accent_hex, kind, max_level, is_active, sort_order, name_i18n)
values
  -- Technik  (#00F0FF)
  ('tech.games',      'games',         'tech',    'Games & Engines',   '🎮', '#00F0FF', 'knowledge', 10, true, 15,
   '{"de":"Games & Engines","en":"Games & Engines"}'::jsonb),
  ('tech.web',        'web',           'tech',    'Web & Netz',        '🌐', '#00F0FF', 'knowledge', 10, true, 16,
   '{"de":"Web & Netz","en":"Web & Networks"}'::jsonb),

  -- Geld  (#7CFF6B)
  ('finance.taxes',   'steuern',       'finance', 'Steuern & Abgaben', '🧾', '#7CFF6B', 'knowledge', 10, true, 25,
   '{"de":"Steuern & Abgaben","en":"Taxes"}'::jsonb),
  ('finance.work',    'gehalt',        'finance', 'Gehalt & Job',      '💼', '#7CFF6B', 'knowledge', 10, true, 26,
   '{"de":"Gehalt & Job","en":"Pay & Work"}'::jsonb),

  -- Wissenschaft  (#B78BFF)
  ('science.chem',    'chemie',        'science', 'Chemie',            '⚗️', '#B78BFF', 'knowledge', 10, true, 36,
   '{"de":"Chemie","en":"Chemistry"}'::jsonb),
  ('science.earth',   'erde',          'science', 'Erde & Ozeane',     '🌍', '#B78BFF', 'knowledge', 10, true, 37,
   '{"de":"Erde & Ozeane","en":"Earth & Oceans"}'::jsonb),
  ('science.math',    'mathematik',    'science', 'Mathematik',        '📐', '#B78BFF', 'knowledge', 10, true, 38,
   '{"de":"Mathematik","en":"Mathematics"}'::jsonb),

  -- Koerper  (#FFD84D)
  ('body.health',     'gesundheit',    'body',    'Gesundheit',        '🩺', '#FFD84D', 'knowledge', 10, true, 44,
   '{"de":"Gesundheit","en":"Health"}'::jsonb),
  ('body.mental',     'psyche',        'body',    'Psyche',            '🫀', '#FFD84D', 'knowledge', 10, true, 45,
   '{"de":"Psyche","en":"Mental health"}'::jsonb),

  -- Kopf  (#FF6BA8)
  ('mind.decisions',  'entscheiden',   'mind',    'Entscheiden',       '🎯', '#FF6BA8', 'knowledge', 10, true, 54,
   '{"de":"Entscheiden","en":"Decisions"}'::jsonb),
  ('mind.creativity', 'kreativitaet',  'mind',    'Kreativität',       '💡', '#FF6BA8', 'knowledge', 10, true, 55,
   '{"de":"Kreativität","en":"Creativity"}'::jsonb),

  -- Welt  (#FF9F45)
  ('world.history',   'geschichte',    'world',   'Geschichte',        '🏛️', '#FF9F45', 'knowledge', 10, true, 65,
   '{"de":"Geschichte","en":"History"}'::jsonb),
  ('world.culture',   'kultur',        'world',   'Kultur & Sprache',  '🎭', '#FF9F45', 'knowledge', 10, true, 66,
   '{"de":"Kultur & Sprache","en":"Culture & Language"}'::jsonb),
  ('world.media',     'medien',        'world',   'Medien',            '📰', '#FF9F45', 'knowledge', 10, true, 67,
   '{"de":"Medien","en":"Media"}'::jsonb),

  -- Alltag & Recht  (#C8D94E)
  ('life.rights',     'recht',         'life',    'Deine Rechte',      '⚖️', '#C8D94E', 'knowledge', 10, true, 76,
   '{"de":"Deine Rechte","en":"Your Rights"}'::jsonb),
  ('life.housing',    'wohnen',        'life',    'Wohnen & Miete',    '🏠', '#C8D94E', 'knowledge', 10, true, 77,
   '{"de":"Wohnen & Miete","en":"Housing & Rent"}'::jsonb),
  ('life.mobility',   'mobilitaet',    'life',    'Unterwegs',         '🚲', '#C8D94E', 'knowledge', 10, true, 78,
   '{"de":"Unterwegs","en":"Getting Around"}'::jsonb),
  ('life.consumer',   'verbraucher',   'life',    'Kaufen & Verträge', '🛒', '#C8D94E', 'knowledge', 10, true, 79,
   '{"de":"Kaufen & Verträge","en":"Buying & Contracts"}'::jsonb)
on conflict (id) do nothing;
