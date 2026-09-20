-- =============================================================================
-- 0124_rahmen_farbe.sql  ·  Rahmenfarbe waehlen, drei Rahmen fuer PRO
--
-- Zwei Dinge, beide reine Kosmetik - und genau deshalb bei PRO richtig
-- aufgehoben:
--
--   1. FARBE. Bisher trug ein Rahmen die Farbe seines Themas. Mit PRO darf
--      man sie tauschen, aus einer festen Palette (sonst steht irgendwann
--      ein Rahmen in Neonpink auf dunklem Grund, den niemand mehr sieht).
--      Der Rahmen selbst bleibt verdient: die Farbe aendert nichts daran,
--      WAS man freigespielt hat.
--
--   2. DREI EIGENE PRO-RAHMEN. Onyx, Aurum und Prisma bekommt jede PRO-
--      Person sofort - ohne Mastery, ohne Warten. Sie sehen anders aus als
--      die Meisterwege-Rahmen (eigene Ornamente, eigene Farben) und stehen
--      deshalb nicht in Konkurrenz zu ihnen: ein Meisterweg-Rahmen sagt
--      "das habe ich gelernt", ein PRO-Rahmen sagt "das gefaellt mir".
--
-- meister_frei wird vollstaendig aus 0095 uebernommen und nur um die drei
-- PRO-Rahmen ergaenzt. meister_waehlen bekommt die Farbe dazu.
-- =============================================================================

alter table public.profiles add column if not exists rahmen_farbe text;

comment on column public.profiles.rahmen_farbe is
  'Gewaehlte Rahmenfarbe (0124, PRO). NULL = Farbe des Themas.';

--: Die Palette. Kurz gehalten und auf dem dunklen Grund geprueft - jede
--: Farbe muss neben einem Profilbild noch als Rahmen lesbar sein.
create or replace function public.rahmen_farben()
returns text[]
language sql immutable set search_path = ''
as $fn$
  select array['#D9B872', '#C9D0D8', '#B78BFF', '#00F0FF', '#7CFF6B',
               '#FF9F45', '#FF6BA8', '#5AD1C4', '#E8E4DE'];
$fn$;

-- --- meister_frei (vollstaendig aus 0095, plus die drei PRO-Rahmen) ----------
create or replace function public.meister_frei(p_user uuid)
returns table (art text, wert text)
language sql stable security definer set search_path = ''
as $fn$
  select distinct b.art, b.wert
    from public.meister_belohnungen b
    join public.meister_mastery(p_user) m on m.wurzel = b.wurzel
   where public.meister_stufe(m.mastery) >= b.stufe
     and (not b.pro or public.ist_pro(p_user))
  union
  -- 0124: drei Rahmen, die zu PRO gehoeren und nicht zu einem Thema.
  select 'rahmen', w
    from unnest(array['pro-onyx', 'pro-aurum', 'pro-prisma']) w
   where public.ist_pro(p_user);
$fn$;
revoke execute on function public.meister_frei(uuid) from anon, authenticated;

-- --- meister_waehlen (vollstaendig aus 0095, plus Farbe) --------------------
create or replace function public.meister_waehlen(p_rahmen text, p_namensfarbe text, p_rahmen_farbe text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if p_rahmen is not null and not exists (
    select 1 from public.meister_frei(v_me) f where f.art = 'rahmen' and f.wert = p_rahmen
  ) then
    raise exception 'Diesen Rahmen hast du noch nicht freigespielt';
  end if;
  if p_namensfarbe is not null and not exists (
    select 1 from public.meister_frei(v_me) f where f.art = 'name' and f.wert = p_namensfarbe
  ) then
    raise exception 'Diese Namensfarbe hast du noch nicht freigespielt';
  end if;
  if p_rahmen_farbe is not null then
    if not public.ist_pro(v_me) then
      raise exception 'PRO: Die Rahmenfarbe waehlst du mit PRO.';
    end if;
    if not (p_rahmen_farbe = any (public.rahmen_farben())) then
      raise exception 'Diese Farbe gibt es nicht';
    end if;
  end if;
  update public.profiles
     set rahmen = p_rahmen, namensfarbe = p_namensfarbe, rahmen_farbe = p_rahmen_farbe
   where id = v_me;
  return jsonb_build_object('rahmen', p_rahmen, 'namensfarbe', p_namensfarbe, 'rahmen_farbe', p_rahmen_farbe);
end
$fn$;

-- Die alte Fassung mit zwei Parametern abraeumen: zwei Funktionen gleichen
-- Namens, und PostgREST muss raten, welche gemeint ist.
drop function if exists public.meister_waehlen(text, text);

revoke execute on function public.meister_waehlen(text, text, text) from anon;
grant execute on function public.meister_waehlen(text, text, text) to authenticated;
revoke execute on function public.rahmen_farben() from anon;
grant execute on function public.rahmen_farben() to authenticated;

-- --- meisterwege() (vollstaendig aus 0095, plus rahmen_farbe) ---------------
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
    -- 0124: gewaehlte Rahmenfarbe, die Palette und der PRO-Stand.
    'rahmen_farbe', (select rahmen_farbe from public.profiles where id = auth.uid()),
    'farben',      to_jsonb(public.rahmen_farben()),
    'pro',         public.ist_pro(auth.uid()),
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

do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0124: kein Konto'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    -- Ohne PRO keine Farbe und keine PRO-Rahmen.
    update public.profiles set plan = 'free' where id = v_id;
    if exists (select 1 from public.meister_frei(v_id) f where f.wert = 'pro-onyx') then
      raise exception 'Selbsttest 0124: PRO-Rahmen ohne PRO frei';
    end if;
    begin
      perform public.meister_waehlen(null, null, '#D9B872');
      raise exception 'Selbsttest 0124: Farbe ohne PRO gesetzt';
    exception when others then
      if sqlerrm not like 'PRO:%' then raise; end if;
    end;

    -- Mit PRO: Rahmen frei, Farbe setzbar, unbekannte Farbe nicht.
    update public.profiles set plan = 'gifted', plan_expires_at = now() + interval '1 day' where id = v_id;
    if not exists (select 1 from public.meister_frei(v_id) f where f.wert = 'pro-prisma') then
      raise exception 'Selbsttest 0124: PRO-Rahmen fehlen';
    end if;
    v_j := public.meister_waehlen('pro-onyx', null, '#C9D0D8');
    if v_j->>'rahmen_farbe' <> '#C9D0D8' then raise exception 'Selbsttest 0124: Farbe nicht gesetzt: %', v_j; end if;
    begin
      perform public.meister_waehlen('pro-onyx', null, '#123456');
      raise exception 'Selbsttest 0124: unbekannte Farbe angenommen';
    exception when others then
      if sqlerrm like 'Selbsttest%' then raise; end if;
    end;
    if (public.meisterwege()->>'rahmen_farbe') <> '#C9D0D8' then
      raise exception 'Selbsttest 0124: meisterwege ohne Farbe';
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0124: ok';
end
$test$;

notify pgrst, 'reload schema';
