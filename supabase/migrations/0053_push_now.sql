-- =============================================================================
-- 0053_push_now.sql  ·  Benachrichtigungen sofort zustellen
--
-- Was sich aendert
-- ----------------
-- Bisher hing der Versand am GitHub-Workflow, also am Drei-Stunden-Takt.
-- "X folgt dir jetzt" kam im Schnitt anderthalb Stunden zu spaet - das
-- stand in 0051 als bekannte Schwaeche drin und ist jetzt behoben: eine
-- neue Zeile in `notifications` stoesst die Edge Function an, die in
-- Sekunden zustellt.
--
-- pipeline/push.py bleibt und wird zum Auffangnetz. Was hier durchfaellt
-- (Funktion gerade nicht erreichbar, Push-Dienst kurz weg), holt der
-- naechste Workflow-Lauf nach. Beide beachten `sent_at`, also kann
-- niemand dieselbe Meldung zweimal bekommen.
--
-- Warum im Aufruf kein Schluessel steht
-- -------------------------------------
-- Der uebliche Weg fuer Datenbank-Webhooks ist, den Service-Key als
-- Header in die Triggerdefinition zu schreiben. Der stuende damit im
-- Klartext in dieser Datei und in Git. Kommt nicht in Frage.
--
-- Stattdessen ist die Funktion mit --no-verify-jwt veroeffentlicht und
-- nimmt KEINE Eingaben entgegen: sie liest nicht, was im Aufruf steht,
-- sondern schaut selbst in die Tabelle und verschickt, was offen ist.
-- Wer die Adresse kennt und sie aufruft, loest genau das aus, was
-- ohnehin gleich passiert waere. Es gibt keinen Parameter, ueber den
-- sich etwas unterschieben liesse - deshalb ist der leere Rumpf hier
-- kein Versehen, sondern der Punkt.
--
-- Warum das den Trigger nicht blockiert
-- -------------------------------------
-- pg_net stellt die Anfrage in eine Warteschlange und kehrt sofort
-- zurueck. Die Transaktion, in der jemand auf "Folgen" getippt hat,
-- wartet also nicht auf einen fremden Server - genau die Kopplung, die
-- 0051 mit der Tabelle dazwischen vermeiden wollte, und die hier nicht
-- durch die Hintertuer wieder hereinkommt.
-- =============================================================================

create extension if not exists pg_net with schema extensions;


create or replace function public.notify_push_now()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- Fehler hier duerfen den Ausloeser nicht mitreissen. Wenn pg_net
  -- klemmt, soll man trotzdem jemandem folgen koennen; die Meldung
  -- bleibt liegen und der Workflow holt sie nach.
  begin
    perform extensions.net.http_post(
      url     := 'https://fjnljjsgdigrbsqoewvi.supabase.co/functions/v1/push',
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 4000
    );
  exception when others then
    raise warning 'notify_push_now: %', sqlerrm;
  end;
  return null;
end
$fn$;


-- --- Ein Aufruf je Anweisung, nicht je Zeile --------------------------------
--
-- `for each statement`, und das ist wichtig: ein Repost von jemandem mit
-- zweihundert Followern schreibt zweihundert Zeilen in EINEM insert. Mit
-- `for each row` waeren das zweihundert Aufrufe derselben Funktion, die
-- alle dieselbe Warteschlange abarbeiten wollen. So ist es einer - die
-- Funktion holt sich ohnehin alles Offene auf einmal.
drop trigger if exists notifications_push_now on public.notifications;
create trigger notifications_push_now
  after insert on public.notifications
  for each statement execute function public.notify_push_now();
