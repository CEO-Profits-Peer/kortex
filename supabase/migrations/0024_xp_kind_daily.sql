-- =============================================================================
-- 0024_xp_kind_daily.sql  ·  'daily_challenge' als erlaubte Punkteart
--
-- submit_daily scheiterte mit
--
--     23514  new row for relation "xp_ledger" violates check constraint
--            "xp_ledger_kind_check"
--
-- Die Liste der erlaubten Arten steht seit 0001 fest und kannte die
-- Tagesaufgabe naturgemaess nicht.
--
-- Diese Pruefbedingung ist Absicht und bleibt: sie ist der Grund, warum
-- niemand eine ausgedachte Punkteart in das Konto schreiben kann. Eine neue
-- Quelle von Punkten einzufuehren soll eine bewusste Aenderung am Schema
-- sein und kein Nebeneffekt - lieber ein fehlgeschlagener Aufruf im Test als
-- eine Waehrung, die sich unbemerkt aus beliebigen Quellen speist.
--
-- Der Eindeutigkeitsindex auf (user_id, kind, ref_type, ref_id) sorgt
-- nebenbei dafuer, dass die Punkte fuer einen Tag nur einmal gutgeschrieben
-- werden koennen - ref_id ist das Datum. Selbst wenn die Sperre in
-- daily_results je fallen wuerde, gaebe es die Punkte kein zweites Mal.
-- =============================================================================

alter table public.xp_ledger drop constraint if exists xp_ledger_kind_check;

alter table public.xp_ledger add constraint xp_ledger_kind_check
  check (kind in (
    'read', 'quiz_correct', 'quiz_retry', 'interactive', 'batch_bonus',
    'review_correct', 'streak', 'achievement', 'referral', 'gift',
    'daily_challenge'
  ));
