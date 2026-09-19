-- =============================================================================
-- 0108_saison_rahmen.sql  ·  Saison-Rahmen: nur eine Saison lang zu verdienen
--
-- Richtung vom 17.09.: Saison-Kosmetik ja, OHNE Zufallsboxen und mit frei
-- erspielbarer Variante. Also: Wer in der Saison genug Karten liest, bekommt
-- den Rahmen - fuer immer, auch nach dem Ende. PRO bekommt dazu die
-- Goldvariante (mit derselben Leseleistung, nie ohne).
--
-- Erste Saison: "Herbstlaub", 22.09.-20.12.2026, 30 gelesene Karten.
--
-- meister_frei und meisterwege vollstaendig aus 0095, ergaenzt um Saisons.
-- meister_waehlen und das Profilbild pruefen ueber meister_frei - dadurch
-- gelten Saison-Rahmen dort automatisch.
-- =============================================================================

create table if not exists public.saisons (
  id          text primary key,
  name        text not null,
  von         timestamptz not null,
  bis         timestamptz not null,
  ziel_karten int not null check (ziel_karten between 1 and 1000)
);
alter table public.saisons enable row level security;
revoke all on public.saisons from anon, authenticated;
grant select on public.saisons to authenticated;
drop policy if exists saisons_lesen on public.saisons;
create policy saisons_lesen on public.saisons for select to authenticated using (true);

insert into public.saisons (id, name, von, bis, ziel_karten) values
  ('herbst26', 'Herbstlaub', '2026-09-22 00:00+02', '2026-12-20 23:59+01', 30)
on conflict (id) do update set name = excluded.name, von = excluded.von, bis = excluded.bis,
  ziel_karten = excluded.ziel_karten;

create or replace function public.saison_gelesen(p_user uuid, p_saison text)
returns int
language sql stable security definer set search_path = ''
as $fn$
  select count(*)::int
    from public.xp_ledger l, public.saisons s
   where s.id = p_saison and l.user_id = p_user and l.kind = 'read'
     and l.created_at between s.von and s.bis;
$fn$;
revoke execute on function public.saison_gelesen(uuid, text) from anon, authenticated;

-- --- meister_frei (vollstaendig aus 0095) ---------------------------------------------------
create or replace function public.meister_frei(p_user uuid)
returns table (art text, wert text)
language sql stable security definer set search_path = ''
as $fn$
  select distinct b.art, b.wert
    from public.meister_belohnungen b
    join public.meister_mastery(p_user) m on m.wurzel = b.wurzel
   where public.meister_stufe(m.mastery) >= b.stufe
     and (not b.pro or public.ist_pro(p_user))
  -- 0108: Saison-Rahmen. Frei, wer im Zeitraum genug Karten gelesen hat -
  -- auch nach dem Ende der Saison (gerechnet wird nur ueber den Zeitraum).
  union
  select 'rahmen', 'saison-' || s.id || v.suffix
    from public.saisons s
    cross join (values ('', false), ('-gold', true)) as v(suffix, pro)
   where public.saison_gelesen(p_user, s.id) >= s.ziel_karten
     and (not v.pro or public.ist_pro(p_user));
$fn$;
revoke execute on function public.meister_frei(uuid) from anon, authenticated;

-- --- meisterwege (vollstaendig aus 0095) ----------------------------------------------------
create or replace function public.meisterwege()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with m as (select * from public.meister_mastery(auth.uid())),
       frei as (select * from public.meister_frei(auth.uid()))
  select jsonb_build_object(
    -- 0108: die laufende (oder zuletzt gelaufene) Saison mit Fortschritt.
    'saison', (
      select jsonb_build_object(
               'id', s.id, 'name', s.name, 'von', s.von, 'bis', s.bis, 'ziel', s.ziel_karten,
               'laeuft', now() between s.von and s.bis,
               'gelesen', public.saison_gelesen(auth.uid(), s.id))
        from public.saisons s
       where s.von <= now()
       order by s.von desc
       limit 1),
    'rahmen',      (select rahmen from public.profiles where id = auth.uid()),
    'namensfarbe', (select namensfarbe from public.profiles where id = auth.uid()),
    'wege', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.display_name, 'emoji', c.emoji, 'farbe', c.accent_hex,
               'mastery', coalesce(m.mastery, 0),
               'stufe', public.meister_stufe(coalesce(m.mastery, 0)),
               'naechste', case when public.meister_stufe(coalesce(m.mastery, 0)) >= 5 then null
                                else public.meister_schwelle(public.meister_stufe(coalesce(m.mastery, 0)) + 1) end,
               'belohnungen', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', b.id, 'stufe', b.stufe, 'art', b.art, 'wert', b.wert,
                          'titel', b.titel, 'pro', b.pro,
                          'frei', exists (select 1 from frei f where f.art = b.art and f.wert = b.wert)
                        ) order by b.stufe, b.pro), '[]'::jsonb)
                   from public.meister_belohnungen b where b.wurzel = c.id)
             ) order by c.sort_order)
        from public.categories c
        left join m on m.wurzel = c.id
       where c.parent_id is null and c.is_active
         and exists (select 1 from public.meister_belohnungen b where b.wurzel = c.id)
    ), '[]'::jsonb)
  );
$fn$;
revoke execute on function public.meisterwege() from anon;
grant execute on function public.meisterwege() to authenticated;


-- --- Selbsttest ----------------------------------------------------------------------------
do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0108: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    v_j := public.meisterwege();
    if v_j->'wege' is null then raise exception 'Selbsttest 0108: meisterwege kaputt: %', v_j; end if;
    perform count(*) from public.meister_frei(v_id);
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0108: ok';
end
$test$;

notify pgrst, 'reload schema';
