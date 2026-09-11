-- =============================================================================
-- 0027_kinetic_cards.sql  ·  Erklaerkarten
--
-- Was das ist
-- -----------
-- Eine Karte, die sich selbst erklaert: Text weicht einer Grafik, die Grafik
-- baut sich auf, eine Stimme spricht dazu, unten steht immer nur der gerade
-- gesprochene Satz.
--
-- Das Format
-- ----------
-- Ein Drehbuch aus TAKTEN. Jeder Takt hat einen Satz und ein Bild:
--
--   {"beats": [
--     {"say": "Du legst 1000 Euro an, zu 6 Prozent.",
--      "show": {"kind": "statement", "text": "1.000 €", "sub": "zu 6 % pro Jahr"}},
--     {"say": "Nach einem Jahr sind es 1060.",
--      "show": {"kind": "table", "id": "zins", "head": ["Jahr", "Guthaben"],
--               "rows": [["1", "1.060 €"]]}}
--   ]}
--
-- Vier Bildarten reichen fuer den Anfang:
--
--   statement  eine grosse Zahl oder Aussage mit Unterzeile
--   table      Zeilen, die nacheinander erscheinen
--   bars       Balken, die auf ihren Wert wachsen
--   figure     die generative Blaupausen-Grafik
--
-- Warum jeder Takt sein Bild VOLLSTAENDIG beschreibt
-- --------------------------------------------------
-- Die Tabelle im Beispiel wiederholt in jedem Takt alle bisherigen Zeilen.
-- Das ist absichtlich redundant. Die Alternative waere, Aenderungen
-- anzugeben ("fuege Zeile hinzu") - dann muss aber jeder, der ein Drehbuch
-- erzeugt, den Zustand mitdenken. Ein Sprachmodell macht dabei Fehler, und
-- der Fehler faellt erst beim Abspielen auf. So ist jeder Takt fuer sich
-- pruefbar, und `id` sagt der App nur, dass zwei Takte dasselbe Bild meinen
-- und sie ueberblenden statt neu aufbauen soll.
--
-- Warum kein Zeitplan im Drehbuch
-- --------------------------------
-- Es steht bewusst keine Dauer drin. Die App spricht jeden Takt als EIGENE
-- Aeusserung und schaltet weiter, wenn die Sprachausgabe fertig meldet.
-- Damit stimmt die Synchronisierung immer - auf jedem Geraet, in jeder
-- Sprechgeschwindigkeit, auch wenn jemand die Systemstimme umgestellt hat.
-- Feste Zeiten waeren auf dem ersten Geraet perfekt und auf dem zweiten
-- daneben.
-- =============================================================================

alter table public.content_items
  add column if not exists kinetic_script jsonb;

comment on column public.content_items.kinetic_script is
  'Drehbuch fuer presentation_mode=kinetic: {"beats":[{"say":..., "show":{...}}]}. Siehe 0027 und app/src/features/kinetic/.';

-- Nur Erklaerkarten haben ein Drehbuch, und Erklaerkarten brauchen eins.
-- Ohne diese Bedingung entstehen zwei stille Fehlerarten: eine kinetische
-- Karte ohne Inhalt (bleibt leer) und ein Drehbuch, das nie abgespielt wird
-- (Arbeit umsonst).
alter table public.content_items
  drop constraint if exists content_items_kinetic_script_check;

alter table public.content_items
  add constraint content_items_kinetic_script_check check (
    (presentation_mode = 'kinetic') = (kinetic_script is not null)
  );

-- Der Feed fragt haeufig "gibt es hier eine Erklaerkarte?" - deshalb ein
-- Teilindex statt eines vollen.
create index if not exists content_items_kinetic_idx
  on public.content_items (primary_category_id, created_at desc)
  where presentation_mode = 'kinetic' and status = 'approved';
