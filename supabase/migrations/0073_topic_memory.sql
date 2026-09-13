-- =============================================================================
-- 0073_topic_memory.sql  ·  Welches Thema schon versucht wurde - und wie es ausging
--
-- Solange die Themen eine feste Liste von 382 Zeilen waren, ging es ohne:
-- Evergreen holte jeden Artikel, fragte `known_hashes`, und was schon eine
-- Karte hatte, fiel raus. Das kostet eine Wikipedia-Anfrage je Thema und Lauf
-- und keinen Gemini-Aufruf - bei 382 Zeilen erträglich.
--
-- Mit automatisch gefundenen Themen (pipeline/topic_discovery.py) geht das
-- nicht mehr, aus zwei Gruenden:
--
--   1. Die Liste waechst ohne Ende. Jeden bekannten Artikel bei jedem Lauf
--      neu zu holen, nur um festzustellen, dass er schon eine Karte hat, frisst
--      das Zeitbudget des Laufs.
--   2. Und teurer: was das Modell als unbrauchbar ablehnt oder die Pruefung
--      verwirft, hinterlaesst KEINE Zeile in content_items. Es wurde also bei
--      jedem Lauf wieder versucht - mit Gemini-Aufruf. Bei einer Handliste
--      waren das eine Handvoll; bei tausenden gefundenen Themen waere es der
--      Grossteil des Kontingents.
--
-- Diese Tabelle haelt fest, wie jedes Thema ausging. Ein Thema wird genau so
-- oft versucht, wie es sich lohnt: 'karte', 'unbrauchbar', 'kein_artikel' und
-- 'dublette' nie wieder; 'abgelehnt' noch einmal, weil die Pruefung vom
-- Wortlaut abhaengt und ein zweiter Anlauf oft durchgeht.
--
-- Nur die Pipeline schreibt und liest (service_role). Kein Zugriff aus der
-- App - hier steht nichts, was ein Nutzer braucht.
-- =============================================================================

create table if not exists public.topic_memory (
  language    text not null,
  title       text not null,
  category_id text not null references public.categories(id) on delete cascade,
  --: 'liste' = topics.py, 'entdeckt' = topic_discovery.py
  herkunft    text not null check (herkunft in ('liste', 'entdeckt')),
  status      text not null default 'offen'
              check (status in ('offen', 'karte', 'abgelehnt', 'unbrauchbar', 'kein_artikel', 'dublette')),
  versuche    smallint not null default 0,
  --: Nur bei gefundenen Themen: Verweise aus der Kategorie mal Eigenanteil.
  score       numeric(6, 2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (language, title)
);

create index if not exists topic_memory_offen_idx
  on public.topic_memory (language, status, score desc);

alter table public.topic_memory enable row level security;
revoke all on public.topic_memory from anon, authenticated;
