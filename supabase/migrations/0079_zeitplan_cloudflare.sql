-- =============================================================================
-- 0079_zeitplan_cloudflare.sql  ·  Geplant ist auch, was Cloudflare anstoesst
--
-- GitHubs eigener Zeitplan laesst Laeufe aus (13.09.: vier von sieben bis
-- zum Abend). Seit workers/ingest-anstoss stoesst ein Cloudflare Worker den
-- Workflow puenktlich an. Fuer GitHub ist das ein workflow_dispatch; die
-- Laufbilanz schreibt ihn als ausloeser = 'zeitplan'.
--
-- admin_runs zaehlte unter "geplant" nur 'schedule'. Ohne diese Aenderung
-- stuende im Kontrollzentrum ab dem Umstieg "0 von 8 geplant" - genau am Tag,
-- an dem es zum ersten Mal alle acht werden.
--
-- Vollstaendig aus 0074 uebernommen (dort die einzige Fassung), eine
-- Bedingung geaendert.
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
                   where r.skript = 'ingest' and r.ausloeser in ('schedule', 'zeitplan')
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
