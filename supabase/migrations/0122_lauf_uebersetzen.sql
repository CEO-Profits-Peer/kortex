-- =============================================================================
-- 0122_lauf_uebersetzen.sql  ·  Der Uebersetzungslauf in der Laufbilanz
--
-- pipeline_runs.skript kannte 'ingest', 'evergreen', 'backfill' und 'kurse'.
-- pipeline/uebersetzen.py kommt dazu - sonst schreibt der Lauf seine Bilanz
-- nicht, und im Kontrollzentrum fehlt genau der Lauf, bei dem man wissen
-- will, wie viele Uebersetzungen die Pruefung verworfen hat.
-- =============================================================================

alter table public.pipeline_runs drop constraint if exists pipeline_runs_skript_check;
alter table public.pipeline_runs add constraint pipeline_runs_skript_check
  check (skript in ('ingest', 'evergreen', 'backfill', 'kurse', 'uebersetzen'));

notify pgrst, 'reload schema';
