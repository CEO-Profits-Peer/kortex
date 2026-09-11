-- =============================================================================
-- 0009_hash_index.sql
--
-- Der Unique-Index auf content_hash war partiell (where content_hash is not
-- null). Das war unnoetig: Postgres behandelt NULL-Werte in einem Unique-Index
-- ohnehin als voneinander verschieden, mehrere Zeilen ohne Hash sind also auch
-- ohne die Bedingung erlaubt.
--
-- Die Bedingung hat dafuer echten Schaden angerichtet: ON CONFLICT
-- (content_hash) findet einen partiellen Index nur, wenn dieselbe Bedingung
-- mitgegeben wird. Das ist im Seed aufgefallen und waere in der Pipeline
-- (PostgREST kann das gar nicht ausdruecken) das naechste Mal aufgefallen.
--
-- Voller Index = ON CONFLICT funktioniert ueberall, ohne Sonderfall.
-- =============================================================================

drop index if exists public.content_items_hash_uidx;

create unique index content_items_hash_uidx
  on public.content_items (content_hash);
