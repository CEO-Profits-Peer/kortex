-- =============================================================================
-- 0100_ligen.sql  ·  PRO: private Ligen mit Freunden
--
-- Eine Liga ist eine kleine Rangliste unter Leuten, die sich kennen. Ein
-- PRO-Konto legt sie an und bekommt einen Code; BEITRETEN geht fuer alle
-- kostenlos - eine Liga, in die die Freunde ohne PRO nicht duerfen, waere
-- keine Liga mit Freunden.
--
-- Gewertet wird die Woche: XP seit Montag 00:00 (Wien) aus xp_ledger. Jede
-- Woche beginnt bei null, damit wer spaeter dazukommt, nicht ewig hinten
-- liegt. Die XP selbst schreibt weiterhin nur der Server (award_xp).
--
-- Wer beitritt, zeigt den Mitgliedern Name, Profilbild und Wochen-XP - das
-- steht in der App beim Beitreten. leaderboard_opt_in gilt fuer die
-- OEFFENTLICHE Rangliste; der Beitritt ist die Zustimmung fuer diese eine.
--
-- Grenzen: 30 Mitglieder je Liga, 10 Ligen je Person, 3 eigene je PRO-Konto.
-- =============================================================================

create table if not exists public.ligen (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 2 and 40),
  besitzer   uuid not null references public.profiles(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.liga_mitglieder (
  liga_id    uuid not null references public.ligen(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  seit       timestamptz not null default now(),
  primary key (liga_id, user_id)
);
create index if not exists liga_mitglieder_user_idx on public.liga_mitglieder (user_id);

alter table public.ligen enable row level security;
alter table public.liga_mitglieder enable row level security;
revoke all on public.ligen, public.liga_mitglieder from anon, authenticated;

-- Wochenbeginn in Wien - dieselbe Zeitzone, mit der touch_streak rechnet.
create or replace function public.liga_wochenstart()
returns timestamptz
language sql stable set search_path = ''
as $fn$
  select (date_trunc('week', now() at time zone 'Europe/Vienna')) at time zone 'Europe/Vienna';
$fn$;

create or replace function public.liga_erstellen(p_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_id   uuid;
  v_code text;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if not public.ist_pro(v_me) then raise exception 'PRO:Eigene Ligen anlegen geht mit PRO – beitreten kann jede und jeder.'; end if;
  if (select count(*) from public.ligen where besitzer = v_me) >= 3 then
    raise exception 'Höchstens drei eigene Ligen';
  end if;
  if public.post_rejection(coalesce(p_name, '')) is not null then
    raise exception 'Dieser Name geht nicht';
  end if;
  -- Acht Zeichen ohne 0/O und 1/I: wird abgetippt, nicht kopiert.
  loop
    v_code := translate(upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), '01', 'XZ');
    exit when not exists (select 1 from public.ligen where code = v_code);
  end loop;
  insert into public.ligen (name, besitzer, code) values (btrim(p_name), v_me, v_code) returning id into v_id;
  insert into public.liga_mitglieder (liga_id, user_id) values (v_id, v_me);
  return jsonb_build_object('id', v_id, 'code', v_code);
end
$fn$;

create or replace function public.liga_beitreten(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_liga public.ligen;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  select * into v_liga from public.ligen
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then return jsonb_build_object('ok', false, 'fehler', 'Diesen Code gibt es nicht.'); end if;
  if exists (select 1 from public.liga_mitglieder where liga_id = v_liga.id and user_id = v_me) then
    return jsonb_build_object('ok', true, 'id', v_liga.id, 'name', v_liga.name);
  end if;
  if (select count(*) from public.liga_mitglieder where liga_id = v_liga.id) >= 30 then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Liga ist voll (30).');
  end if;
  if (select count(*) from public.liga_mitglieder where user_id = v_me) >= 10 then
    return jsonb_build_object('ok', false, 'fehler', 'Du bist schon in zehn Ligen.');
  end if;
  insert into public.liga_mitglieder (liga_id, user_id) values (v_liga.id, v_me);
  return jsonb_build_object('ok', true, 'id', v_liga.id, 'name', v_liga.name);
end
$fn$;

-- Verlassen. Geht die Besitzerin, endet die Liga fuer alle - eine Liga ohne
-- jemanden, der sie verwaltet, bleibt sonst fuer immer liegen.
create or replace function public.liga_verlassen(p_liga uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if exists (select 1 from public.ligen where id = p_liga and besitzer = v_me) then
    delete from public.ligen where id = p_liga;
  else
    delete from public.liga_mitglieder where liga_id = p_liga and user_id = v_me;
  end if;
end
$fn$;

create or replace function public.meine_ligen()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name, 'code', l.code,
           'meine', l.besitzer = auth.uid(),
           'wochenstart', public.liga_wochenstart(),
           'tabelle', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'handle', p.handle,
                      'name', coalesce(nullif(trim(p.display_name), ''), p.handle),
                      'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
                      'rahmen', p.rahmen,
                      'ich', p.id = auth.uid(),
                      'xp', w.xp
                    ) order by w.xp desc, p.handle), '[]'::jsonb)
               from public.liga_mitglieder m
               join public.profiles p on p.id = m.user_id
               cross join lateral (
                 select coalesce(sum(x.xp_amount), 0)::int as xp
                   from public.xp_ledger x
                  where x.user_id = m.user_id and x.created_at >= public.liga_wochenstart()
               ) w
              where m.liga_id = l.id)
         ) order by l.created_at), '[]'::jsonb)
    from public.ligen l
    join public.liga_mitglieder me on me.liga_id = l.id and me.user_id = auth.uid();
$fn$;

revoke execute on function public.liga_erstellen(text), public.liga_beitreten(text),
  public.liga_verlassen(uuid), public.meine_ligen() from anon;
grant execute on function public.liga_erstellen(text), public.liga_beitreten(text),
  public.liga_verlassen(uuid), public.meine_ligen() to authenticated;

-- --- Selbsttest (rollt alles zurueck) ------------------------------------------------
do $test$
declare
  v_a uuid;
  v_b uuid;
  v_j jsonb;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  if v_a is null then raise notice 'Selbsttest 0100: kein Konto'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    update public.profiles set plan = 'free', plan_expires_at = null where id = v_a;
    begin
      perform public.liga_erstellen('Selbsttest');
      raise exception 'Selbsttest 0100: Liga ohne PRO angelegt';
    exception when others then
      if sqlerrm not like 'PRO:%' then raise; end if;
    end;
    update public.profiles set plan = 'gifted', plan_expires_at = now() + interval '1 day' where id = v_a;
    v_j := public.liga_erstellen('Selbsttest');
    if v_b is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      v_j := public.liga_beitreten(v_j->>'code');
      if not (v_j->>'ok')::boolean then raise exception 'Selbsttest 0100: Beitritt ging nicht: %', v_j; end if;
      if jsonb_array_length(public.meine_ligen()->0->'tabelle') <> 2 then
        raise exception 'Selbsttest 0100: Tabelle nicht zwei Leute';
      end if;
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0100: ok';
end
$test$;

notify pgrst, 'reload schema';
