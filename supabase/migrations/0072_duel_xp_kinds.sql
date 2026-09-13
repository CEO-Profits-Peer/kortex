-- =============================================================================
-- 0072_duel_xp_kinds.sql  ·  Warum der zweite Spieler nie abgeben konnte
--
-- Gemeldet: "Abgabe ging nicht" im Duell.
--
-- Die Ursache ist dieselbe wie in 0024, und diesmal war der Fehler meiner:
-- xp_ledger erlaubt nur eine feste Liste von Punktearten, und 0069 vergibt
-- 'duel_win' und 'duel_draw', ohne sie dort einzutragen. Beim Schreiben von
-- 0069 habe ich die Pruefregel nicht nachgelesen.
--
-- Warum es nur den ZWEITEN Spieler trifft: Punkte werden erst verteilt, wenn
-- beide abgegeben haben. Die erste Abgabe laeuft sauber durch; die zweite
-- verletzt beim Punkte-Eintrag die Pruefregel, und die GANZE Abgabe wird
-- zurueckgerollt - samt Antworten und Ergebnis.
--
-- Genau so steht es in den Daten (Duell 22cb105f, 2026-09-13): Herausforderer
-- abgegeben, 3 von 5 richtig; beim Gegner stehen die Fragen seit 09:05:47
-- offen, eine Abgabe gibt es nicht.
--
-- Die Pruefregel selbst bleibt, und zwar aus dem Grund, den 0024 nennt: eine
-- neue Punktequelle soll eine bewusste Aenderung am Schema sein, kein
-- Nebeneffekt. Die Liste unten ist die aus 0024, um die zwei Duell-Arten
-- ergaenzt - nicht die aus 0001, sonst waere 'daily_challenge' wieder weg.
-- =============================================================================

alter table public.xp_ledger drop constraint if exists xp_ledger_kind_check;

alter table public.xp_ledger add constraint xp_ledger_kind_check
  check (kind in (
    'read', 'quiz_correct', 'quiz_retry', 'interactive', 'batch_bonus',
    'review_correct', 'streak', 'achievement', 'referral', 'gift',
    'daily_challenge',
    'duel_win', 'duel_draw'
  ));


-- --- Duelle, die an diesem Fehler haengen geblieben sind --------------------
--
-- Ein Spieler hat abgegeben, beim anderen wurde die Abgabe zurueckgerollt: die
-- Fragen hat er gesehen, seine Antworten sind weg, und seine Uhr ist laengst
-- abgelaufen. Nachspielen waere unfair (er kennt die Fragen), eine Null waere
-- es auch (er hat abgegeben). Abschliessen ist das Einzige, was fuer beide
-- gleich ist. Danach laesst sich ein neues Duell starten - vorher sperrt das
-- offene die Paarung.
--
-- Bewusst eng: nur Duelle, in denen der eine FERTIG ist und der andere die
-- Fragen geholt, aber nicht abgegeben hat, und dessen Frist schon um ist.
-- Wer einfach noch nicht gespielt hat, bleibt unberuehrt.
update public.duels d
   set expires_at = now()
 where d.expires_at > now()
   and exists (
     select 1 from public.duel_plays fertig
      where fertig.duel_id = d.id and fertig.finished_at is not null)
   and exists (
     select 1 from public.duel_plays haengt
      where haengt.duel_id = d.id
        and haengt.quiz_started_at is not null
        and haengt.finished_at is null
        and haengt.quiz_started_at
            < now() - make_interval(secs => public.duel_quiz_seconds() + public.duel_grace_seconds()));
