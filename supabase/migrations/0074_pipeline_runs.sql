-- =============================================================================
-- 0074_pipeline_runs.sql  ·  Jeder Lauf schreibt mit, was er geschafft hat
--
-- Anlass: am 2026-09-13 kamen 22 Karten statt rund 150. Aus der Ferne zu
-- sehen war nur: um 11:58 ein roter Lauf, um 16:24 ein gruener mit neun
-- Karten, und GitHub haette statt vier Laeufen sechs starten sollen. Warum,
-- stand in Protokollen, die nur mit GitHub-Anmeldung lesbar sind - fuer mich
-- also gar nicht. Ich musste raten, und geraten habe ich zuerst falsch
-- (Kontingent), bis das Protokoll einen 504 von Supabase zeigte.
--
-- Deshalb jetzt eine Zeile je Skript je Lauf, geschrieben von der Pipeline
-- selbst (pipeline/laufbilanz.py):
--
--   - am Anfang, mit status 'laeuft'. Bleibt sie so stehen, ist der Lauf
--     gestorben, bevor er etwas sagen konnte - abgeschossen vom Zeitlimit
--     oder hart beendet. Auch das ist eine Auskunft.
--   - am Ende mit Karten, Gemini-Aufrufen, dem Grund des Aufhoerens und,
--     wenn es einen gab, dem Fehler.
--
-- `stopp` ist die eigentliche Frage. "9 Karten" heisst nichts, solange man
-- nicht weiss, ob der Lauf alles abgearbeitet hat, das Kontingent leer war,
-- die Zeit um war oder der Aufrufdeckel gegriffen hat. Das sind vier
-- verschiedene Baustellen.
--
-- Nur die Pipeline schreibt (service_role), gelesen wird ueber admin_runs()
-- mit derselben Doppelsperre wie 0064: Admin-Konto UND PIN.
-- =============================================================================

create table if not exists public.pipeline_runs (
  id              bigint generated always as identity primary key,
  skript          text not null check (skript in ('ingest', 'evergreen', 'backfill')),
  --: 'schedule', 'workflow_dispatch' oder 'lokal'
  ausloeser       text not null default 'lokal',
  --: Verbindet die drei Skripte eines Workflow-Laufs zu einem Durchgang.
  github_run_id   bigint,
  gestartet_at    timestamptz not null default now(),
  beendet_at      timestamptz,
  status          text not null default 'laeuft'
                  check (status in ('laeuft', 'fertig', 'fehler')),
  --: Warum aufgehoert: durch, zeit, aufrufe, artikel, kontingent,
  --: gemini_fehler, limit, ziel, nichts_offen, nur_entdecken, absturz,
  --: abgeschossen, fehler. Absichtlich ohne check - ein neuer Grund soll
  --: keine Migration brauchen, nur eine Beschriftung in der App.
  stopp           text,
  karten          integer not null default 0,
  gemini_aufrufe  integer not null default 0,
  wiederholungen  integer not null default 0,
  modell          text,
  --: Der wievielte Schluessel zuletzt lief (1-basiert).
  schluessel      smallint,
  --: Alle Zaehler des Skripts, wie sie in der Schlussbilanz stehen.
  zahlen          jsonb not null default '{}'::jsonb,
  fehler          text,
  trockenlauf     boolean not null default false
);

create index if not exists pipeline_runs_zeit_idx
  on public.pipeline_runs (gestartet_at desc);

alter table public.pipeline_runs enable row level security;
revoke all on public.pipeline_runs from anon, authenticated;


-- =============================================================================
-- Die Ansicht fuers Kontrollzentrum
--
-- `karten_db` zaehlt direkt in content_items, nicht in den Bilanzen. Zwei
-- Gruende: fuer die Tage VOR dieser Migration gibt es keine Bilanz, und ein
-- abgeschossener Lauf kann Karten geschrieben haben, die er nicht mehr
-- melden konnte. Weichen beide Zahlen voneinander ab, ist genau das passiert.
--
-- `geplant` zaehlt Durchgaenge, die GitHub nach Zeitplan gestartet hat. Der
-- Zeitplan sagt acht am Tag (17 */3). Die Differenz ist das, was GitHub
-- auslaesst - die Zahl, an der sich entscheidet, ob der Anstoss von aussen
-- kommen muss.
-- =============================================================================
create or replace function public.admin_runs(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_admin boolean;
  v_hash  text;
begin
  select p.is_admin, p.admin_pin_hash into v_admin, v_hash
    from public.profiles p where p.id = v_me;

  -- Ein Satz fuer alles, wie in 0064.
  if v_me is null
     or not coalesce(v_admin, false)
     or v_hash is null
     or v_hash <> extensions.crypt(coalesce(p_pin, ''), v_hash) then
    raise exception 'kein Zugang';
  end if;

  return jsonb_build_object(
    'laeufe', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.gestartet_at desc), '[]'::jsonb)
        from (
          select r.id, r.skript, r.ausloeser, r.github_run_id,
                 r.gestartet_at, r.beendet_at,
                 -- Eine Zeile, die nach 45 Minuten noch "laeuft", laeuft
                 -- nicht mehr: der ganze Job darf 34 Minuten dauern.
                 case when r.status = 'laeuft'
                       and r.gestartet_at < now() - interval '45 minutes'
                      then 'abgebrochen' else r.status end as status,
                 r.stopp, r.karten, r.gemini_aufrufe, r.wiederholungen,
                 r.modell, r.schluessel, r.zahlen,
                 left(r.fehler, 400) as fehler, r.trockenlauf
            from public.pipeline_runs r
           order by r.gestartet_at desc
           limit 90
        ) l
    ),
    'tage', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.tag desc), '[]'::jsonb)
        from (
          select d.tag::date as tag,
                 (select count(distinct coalesce(r.github_run_id::text, r.id::text))
                    from public.pipeline_runs r
                   where r.skript = 'ingest' and r.ausloeser = 'schedule'
                     and r.gestartet_at >= d.tag and r.gestartet_at < d.tag + interval '1 day'
                 ) as geplant,
                 (select count(*)
                    from public.pipeline_runs r
                   where r.skript = 'ingest'
                     and r.gestartet_at >= d.tag and r.gestartet_at < d.tag + interval '1 day'
                 ) as laeufe,
                 (select coalesce(sum(r.gemini_aufrufe), 0)
                    from public.pipeline_runs r
                   where not r.trockenlauf
                     and r.gestartet_at >= d.tag and r.gestartet_at < d.tag + interval '1 day'
                 ) as aufrufe,
                 (select count(*)
                    from public.pipeline_runs r
                   where r.stopp = 'kontingent'
                     and r.gestartet_at >= d.tag and r.gestartet_at < d.tag + interval '1 day'
                 ) as kontingent_leer,
                 (select count(*)
                    from public.pipeline_runs r
                   where (r.status = 'fehler'
                          or (r.status = 'laeuft' and r.gestartet_at < now() - interval '45 minutes'))
                     and r.gestartet_at >= d.tag and r.gestartet_at < d.tag + interval '1 day'
                 ) as fehler,
                 (select count(*)
                    from public.content_items ci
                   where ci.created_at >= d.tag and ci.created_at < d.tag + interval '1 day'
                 ) as karten_db
            from generate_series(
                   date_trunc('day', now()) - interval '13 days',
                   date_trunc('day', now()),
                   interval '1 day'
                 ) as d(tag)
        ) t
    ),
    'stand', now()
  );
end
$fn$;

revoke execute on function public.admin_runs(text) from anon;
grant  execute on function public.admin_runs(text) to authenticated;

notify pgrst, 'reload schema';
