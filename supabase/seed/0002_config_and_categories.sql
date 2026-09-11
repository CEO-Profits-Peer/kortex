-- =============================================================================
-- Tunebare Parameter. Aenderungen wirken sofort, ohne App-Update.
-- =============================================================================

insert into public.app_config (key, value, description) values

('feed_mix', '{"news":0.40,"knowledge":0.40,"serendipity":0.20}',
 'Anteile pro 10er-Batch. Evergreen traegt bewusst gleich viel wie News: News-Nachschub in Nischen auf Deutsch ist duenner als es scheint.'),

('xp_rates', '{
   "read": {"xp":2,  "mastery":0},
   "quiz_correct_first": {"xp":25, "mastery":10},
   "quiz_correct_retry": {"xp":8,  "mastery":3},
   "interactive_solved": {"xp":30, "mastery":12},
   "batch_perfect_bonus": {"xp":50, "mastery":10},
   "review_correct": {"xp":15, "mastery":15},
   "streak_day": {"xp":10, "mastery":0}
 }', 'Passives Lesen ist bewusst billig, aktive Leistung teuer. 100 Cards nur scrollen = 200 XP. 10 Quizfragen richtig = 250 XP + 100 Mastery. Das Leaderboard laeuft NUR ueber mastery_total.'),

('attention', '{
   "min_visible_pct": 80,
   "dwell_floor_ms": 4000,
   "dwell_ceiling_ms": 20000,
   "words_per_second": 3.0,
   "flush_every_n_cards": 10
 }', 'Dwell-Ziel = wortzahl/3.0 Sekunden, gedeckelt. Pauschale 3s wuerden Scrollen als Lesen zaehlen.'),

('variance', '{
   "max_consecutive_same_mode": 2,
   "interactive_every_n_cards": 4,
   "sponsor_every_n_cards": 15,
   "batch_size": 10
 }', 'Anti-Monotonie. Sponsor-Karten erst ab v1.0 aktiv.'),

('limits', '{
   "free_days_unlimited": 7,
   "daily_soft_cap_cards": 100,
   "enough_for_today_at": 60
 }', 'enough_for_today_at: ab hier bietet die App aktiv das Aufhoeren an. Siehe docs/ARCHITECTURE.md, Abschnitt "Die ehrliche Version".'),

('difficulty', '{
   "adapt_up_after_correct_streak": 4,
   "adapt_down_after_wrong_streak": 2,
   "match_tolerance": 1
 }', 'Implizite Niveau-Anpassung. Explizit ueber die too_easy/too_hard Events.')

on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();


-- =============================================================================
-- Kategorien. 'knowledge' ist levelbar, 'news' nicht (News hat Tiefe, keine
-- Schwierigkeit - siehe docs/XP-ECONOMY.md).
-- Die slug-Spalte ist das #hashtag im Search-Tab.
-- =============================================================================

insert into public.categories (id, slug, parent_id, display_name, emoji, kind, accent_hex, sort_order) values
-- Wurzeln
('tech',        'tech',        null, 'Tech & KI',              '⚡', 'knowledge', '#00F0FF', 10),
('finance',     'finanzen',    null, 'Finanzwissen',           '📈', 'knowledge', '#7CFF6B', 20),
('science',     'wissenschaft',null, 'Wissenschaft',           '🔬', 'knowledge', '#B78BFF', 30),
('body',        'koerper',     null, 'Körper & Leistung',      '🏋', 'knowledge', '#FF9F45', 40),
('mind',        'mind',        null, 'Mentale Leistung',       '🧠', 'knowledge', '#FF6BA8', 50),
('world',       'weltgeschehen',null,'Weltgeschehen',          '🌍', 'news',      '#FFFFFF', 60),
('local',       'lokal',       null, 'Regional',               '📍', 'news',      '#FFD84D', 70),

-- Tech
('tech.ai',     'ki',          'tech', 'Künstliche Intelligenz','🤖','knowledge','#00F0FF', 11),
('tech.code',   'programmieren','tech','Programmieren',        '⌨',  'knowledge','#00F0FF', 12),
('tech.security','security',   'tech', 'Sicherheit & Krypto',  '🔐', 'knowledge','#00F0FF', 13),
('tech.hardware','hardware',   'tech', 'Hardware & Chips',     '🔧', 'knowledge','#00F0FF', 14),

-- Finanzen
('finance.basics','geldbasics','finance','Geld-Grundlagen',    '💶', 'knowledge','#7CFF6B', 21),
('finance.compound','zinseszins','finance','Zinseszins & Wachstum','📊','knowledge','#7CFF6B', 22),
('finance.markets','maerkte',  'finance','Märkte & Aktien',    '📉', 'knowledge','#7CFF6B', 23),
('finance.macro','wirtschaft', 'finance','Volkswirtschaft',    '🏦', 'knowledge','#7CFF6B', 24),

-- Wissenschaft
('science.physics','physik',   'science','Physik',             '⚛',  'knowledge','#B78BFF', 31),
('science.bio',  'biologie',   'science','Biologie',           '🧬', 'knowledge','#B78BFF', 32),
('science.neuro','neuro',      'science','Neurowissenschaft',  '🧠', 'knowledge','#B78BFF', 33),
('science.space','weltraum',   'science','Weltraum',           '🚀', 'knowledge','#B78BFF', 34),
('science.climate','klima',    'science','Klima & Umwelt',     '🌱', 'knowledge','#B78BFF', 35),

-- Körper
('body.training','training',   'body', 'Training',             '💪', 'knowledge','#FF9F45', 41),
('body.nutrition','ernaehrung','body', 'Ernährung',            '🥗', 'knowledge','#FF9F45', 42),
('body.sleep',  'schlaf',      'body', 'Schlaf & Regeneration','😴', 'knowledge','#FF9F45', 43),

-- Mind
('mind.learning','lernen',     'mind', 'Lernen lernen',        '📚', 'knowledge','#FF6BA8', 51),
('mind.focus',  'fokus',       'mind', 'Fokus & Aufmerksamkeit','🎯','knowledge','#FF6BA8', 52),
('mind.bias',   'denkfehler',  'mind', 'Denkfehler',           '🎭', 'knowledge','#FF6BA8', 53),

-- News
('world.politics','politik',   'world','Politik',              '🏛', 'news',      '#FFFFFF', 61),
('world.economy','oekonomie',  'world','Wirtschaft',           '💱', 'news',      '#FFFFFF', 62),
('world.tech',  'technews',    'world','Tech-News',            '📡', 'news',      '#FFFFFF', 63),
('world.science','forschung',  'world','Forschung aktuell',    '🔭', 'news',      '#FFFFFF', 64),
('local.at',    'oesterreich', 'local','Österreich',           '🇦🇹','news',      '#FFD84D', 71),
('local.de',    'deutschland', 'local','Deutschland',          '🇩🇪','news',      '#FFD84D', 72),
('local.ch',    'schweiz',     'local','Schweiz',              '🇨🇭','news',      '#FFD84D', 73),
('local.ca',    'canada',      'local','Canada',               '🇨🇦','news',      '#FFD84D', 74)

on conflict (id) do update set
  display_name = excluded.display_name, emoji = excluded.emoji,
  accent_hex = excluded.accent_hex, sort_order = excluded.sort_order;


-- =============================================================================
-- Quellen-Startaufstellung. license_class steuert, was die Pipeline speichern darf.
-- =============================================================================

-- Die Testgruppe sitzt in Oesterreich UND in Kanada -> de und en ab Tag 1.
insert into public.sources (id, handle, display_name, kind, license_class, license_name, homepage_url, trust_score, default_region_code, default_language) values

-- === DEUTSCH ================================================================
-- press_free
('apa-ots',      '@apa-ots',      'APA-OTS',                  'agency',      'press_free', 'Presseaussendung', 'https://www.ots.at',                 75, 'AT',  'de'),
('bka-at',       '@bundeskanzleramt','Bundeskanzleramt AT',   'institution', 'press_free', 'Presseaussendung', 'https://www.bundeskanzleramt.gv.at', 80, 'AT',  'de'),
('eu-kom-de',    '@eu-kommission','Europäische Kommission',   'institution', 'press_free', 'Presseaussendung', 'https://ec.europa.eu/commission/presscorner', 80, null, 'de'),
('idw',          '@idw',          'idw Wissenschaft',         'institution', 'press_free', 'Presseaussendung', 'https://idw-online.de',              75, null,  'de'),
('mpg',          '@maxplanck',    'Max-Planck-Gesellschaft',  'institution', 'press_free', 'Presseaussendung', 'https://www.mpg.de',                 85, null,  'de'),
-- cc
('wikinews-de',  '@wikinews-de',  'Wikinews (DE)',            'wiki',        'cc', 'CC-BY-2.5',   'https://de.wikinews.org',    65, null, 'de'),
('wikipedia-de', '@wikipedia-de', 'Wikipedia (DE)',           'wiki',        'cc', 'CC-BY-SA-4.0','https://de.wikipedia.org',   70, null, 'de'),
('statistik-at', '@statistikat',  'Statistik Austria',        'institution', 'cc', 'CC-BY-4.0',   'https://www.statistik.at',   90, 'AT', 'de'),
-- link_only: NUR Titel + Link. Keine Zusammenfassung, kein Quiz.
('derstandard',  '@derstandard',  'Der Standard',             'agency',      'link_only', null, 'https://www.derstandard.at', 80, 'AT', 'de'),
('orf',          '@orf',          'ORF.at',                   'agency',      'link_only', null, 'https://orf.at',             85, 'AT', 'de'),
('diepresse',    '@diepresse',    'Die Presse',               'agency',      'link_only', null, 'https://www.diepresse.com',  78, 'AT', 'de'),
('zeit',         '@zeit',         'Die Zeit',                 'agency',      'link_only', null, 'https://www.zeit.de',        80, 'DE', 'de'),
('srf',          '@srf',          'SRF',                      'agency',      'link_only', null, 'https://www.srf.ch',         82, 'CH', 'de'),

-- === ENGLISCH ===============================================================
-- press_free
('nasa',         '@nasa',         'NASA',                     'institution', 'press_free', 'Public Domain',    'https://www.nasa.gov/news',     85, null, 'en'),
('esa',          '@esa',          'ESA',                      'institution', 'press_free', 'ESA Terms',        'https://www.esa.int',           85, null, 'en'),
('eurekalert',   '@eurekalert',   'EurekAlert!',              'institution', 'press_free', 'Press Release',    'https://www.eurekalert.org',    75, null, 'en'),
('eu-kom-en',    '@eu-commission','European Commission',      'institution', 'press_free', 'Press Release',    'https://ec.europa.eu/commission/presscorner', 80, null, 'en'),
('europarl',     '@europarl',     'European Parliament',      'institution', 'press_free', 'Press Release',    'https://europarl.europa.eu',    80, null, 'en'),
('canada-gov',   '@canadagov',    'Government of Canada',     'institution', 'press_free', 'Non-commercial reproduction', 'https://www.canada.ca/en/news.html', 80, 'CA', 'en'),
('cern',         '@cern',         'CERN',                     'institution', 'press_free', 'Press Release',    'https://home.cern/news',        88, null, 'en'),
-- cc
('wikinews-en',  '@wikinews',     'Wikinews',                 'wiki',        'cc', 'CC-BY-2.5',    'https://en.wikinews.org',      65, null, 'en'),
('wikipedia-en', '@wikipedia',    'Wikipedia',                'wiki',        'cc', 'CC-BY-SA-4.0', 'https://en.wikipedia.org',     70, null, 'en'),
('statcan',      '@statcan',      'Statistics Canada',        'institution', 'cc', 'StatCan Open License', 'https://www150.statcan.gc.ca', 90, 'CA', 'en'),
('arxiv',        '@arxiv',        'arXiv',                    'preprint',    'cc', 'arXiv License', 'https://arxiv.org',            70, null, 'en'),
('biorxiv',      '@biorxiv',      'bioRxiv',                  'preprint',    'cc', 'CC-BY',        'https://www.biorxiv.org',      70, null, 'en'),
-- link_only
('bbc',          '@bbc',          'BBC',                      'agency',      'link_only', null, 'https://www.bbc.com',        85, null, 'en'),
('reuters',      '@reuters',      'Reuters',                  'agency',      'link_only', null, 'https://www.reuters.com',    88, null, 'en'),
('cbc',          '@cbc',          'CBC News',                 'agency',      'link_only', null, 'https://www.cbc.ca',         82, 'CA', 'en'),

-- === EIGENER CONTENT ========================================================
('internal-de',  '@ely-de',       'Eigene Redaktion (DE)',    'internal',    'owned', null, null, 100, null, 'de'),
('internal-en',  '@ely-en',       'Own Editorial (EN)',       'internal',    'owned', null, null, 100, null, 'en')

on conflict (id) do update set
  display_name     = excluded.display_name,
  license_class    = excluded.license_class,
  trust_score      = excluded.trust_score,
  default_language = excluded.default_language;
