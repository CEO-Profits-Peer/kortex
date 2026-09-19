-- =============================================================================
-- 0118_jahresrueckblick.sql  ·  Dein Jahr
--
-- Wie der Wochenrueckblick (0105), nur ueber ein Kalenderjahr und mit dem,
-- was erst ueber ein Jahr eine Geschichte ergibt: Lerntage, laengste Serie
-- am Stueck, bester Monat, die drei Lieblingsthemen, die Tageszeit, zu der
-- man am meisten lernt, und die Monats-Abzeichen (0117).
--
-- Alles aus xp_ledger, das nur der Server schreibt. Zeitzone Europe/Vienna.
-- Das laufende Jahr geht jederzeit ("Dein Jahr bisher"); Jahre vor dem
-- ersten Eintrag liefern leere Zahlen.
-- =============================================================================

create or replace function public.jahresrueckblick(p_jahr int default null)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with jahr as (
    select coalesce(p_jahr, extract(year from now() at time zone 'Europe/Vienna')::int) as j
  ),
  grenzen as (
    select (make_date(j, 1, 1)::timestamp at time zone 'Europe/Vienna') as ab,
           (make_date(j + 1, 1, 1)::timestamp at time zone 'Europe/Vienna') as bis
      from jahr
  ),
  buch as (
    select l.*, (l.created_at at time zone 'Europe/Vienna') as lokal
      from public.xp_ledger l, grenzen g
     where l.user_id = auth.uid() and l.created_at >= g.ab and l.created_at < g.bis
  ),
  tage as (
    select distinct lokal::date as tag from buch where kind = 'read'
  ),
  -- Serien: aufeinanderfolgende Tage haben denselben Wert tag - Zeilennummer.
  serien as (
    select count(*)::int as laenge
      from (select tag, tag - (row_number() over (order by tag))::int as gruppe from tage) x
     group by gruppe
  ),
  monate as (
    select extract(month from tag)::int as monat, count(*)::int as n from tage group by 1
  ),
  themen as (
    select split_part(b.category_id, '.', 1) as wurzel, count(*)::int as n
      from buch b where b.kind = 'read' and b.category_id is not null
     group by 1 order by 2 desc limit 3
  ),
  stunden as (
    select extract(hour from lokal)::int as h, count(*)::int as n
      from buch where kind = 'read' group by 1
  )
  select jsonb_build_object(
    'jahr', (select j from jahr),
    'laufend', (select j from jahr) = extract(year from now() at time zone 'Europe/Vienna')::int,
    'gelesen', (select count(*) from buch where kind = 'read'),
    'richtig', (select count(*) from buch where kind in ('quiz_correct', 'review_correct')),
    'xp', (select coalesce(sum(xp_amount), 0) from buch),
    'lerntage', (select count(*) from tage),
    'erster_tag', (select min(tag) from tage),
    'serie', (select coalesce(max(laenge), 0) from serien),
    'bester_monat', (select jsonb_build_object('monat', monat, 'tage', n) from monate order by n desc, monat limit 1),
    'themen', (
      select coalesce(jsonb_agg(jsonb_build_object('name', c.display_name, 'emoji', c.emoji,
                                                   'accent', c.accent_hex, 'karten', t.n)
                                order by t.n desc), '[]'::jsonb)
        from themen t join public.categories c on c.id = t.wurzel
    ),
    -- 5-11 Morgen, 11-17 Tag, 17-22 Abend, sonst Nacht.
    'tageszeit', (
      select x.zeit from (
        select case when h between 5 and 10 then 'morgen' when h between 11 and 16 then 'tag'
                    when h between 17 and 21 then 'abend' else 'nacht' end as zeit, sum(n) as n
          from stunden group by 1 order by 2 desc limit 1) x
    ),
    'abzeichen', (
      select jsonb_build_object(
               'gold', count(*) filter (where r.stufe = 3),
               'silber', count(*) filter (where r.stufe = 2),
               'bronze', count(*) filter (where r.stufe = 1))
        from public.monats_abzeichen_rechnung(auth.uid(), 24) r
       where extract(year from r.monat)::int = (select j from jahr)
    ),
    'beste_antworten', (
      select count(*) from public.comments c, grenzen g
       where c.user_id = auth.uid() and c.beste and c.created_at >= g.ab and c.created_at < g.bis
    )
  )
  where auth.uid() is not null;
$fn$;

revoke execute on function public.jahresrueckblick(int) from anon;
grant execute on function public.jahresrueckblick(int) to authenticated;

do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select user_id into v_id from public.xp_ledger where kind = 'read' order by created_at desc limit 1;
  if v_id is null then raise notice 'Selbsttest 0118: keine Lesedaten'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  v_j := public.jahresrueckblick();
  if (v_j->>'gelesen')::int < 1 or (v_j->>'serie')::int < 1 or v_j->'bester_monat' is null then
    raise exception 'Selbsttest 0118: %', v_j;
  end if;
  raise notice 'Selbsttest 0118: ok (% gelesen, Serie %)', v_j->>'gelesen', v_j->>'serie';
end
$test$;

notify pgrst, 'reload schema';
