-- =============================================================================
-- 0106_gruppen_stapel.sql  ·  Lerngruppen-Stapel: gemeinsam Karten sammeln
--
-- Ein Gruppen-Stapel ist ein Arbeitsstand, kein Beitrag: mehrere Leute
-- (per Code, wie die Ligen in 0100) legen Karten hinein oder nehmen sie
-- heraus. Wer ihn angelegt hat, kann ihn am Ende als normalen Stapel
-- veroeffentlichen - das geht ueber create_post, mit dessen Grenzen
-- (10 Karten, mit PRO 50). Hier selbst: hoechstens 50 Karten, 30 Leute.
--
-- Anlegen und beitreten sind kostenlos: Lernen und Wiederholen stehen nie
-- hinter PRO (Entscheidung 17.09.).
-- =============================================================================

create table if not exists public.gruppen_stapel (
  id         uuid primary key default gen_random_uuid(),
  titel      text not null check (length(btrim(titel)) between 2 and 60),
  besitzer   uuid not null references public.profiles(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.gruppen_stapel_mitglieder (
  stapel_id uuid not null references public.gruppen_stapel(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  primary key (stapel_id, user_id)
);
create table if not exists public.gruppen_stapel_karten (
  stapel_id  uuid not null references public.gruppen_stapel(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  von        uuid references public.profiles(id) on delete set null,
  at         timestamptz not null default now(),
  primary key (stapel_id, content_id)
);
alter table public.gruppen_stapel enable row level security;
alter table public.gruppen_stapel_mitglieder enable row level security;
alter table public.gruppen_stapel_karten enable row level security;
revoke all on public.gruppen_stapel, public.gruppen_stapel_mitglieder, public.gruppen_stapel_karten
  from anon, authenticated;

create or replace function public.gs_mitglied(p_stapel uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from public.gruppen_stapel_mitglieder
                  where stapel_id = p_stapel and user_id = auth.uid());
$fn$;
revoke execute on function public.gs_mitglied(uuid) from anon, authenticated;

create or replace function public.gs_erstellen(p_titel text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_id   uuid;
  v_code text;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if (select count(*) from public.gruppen_stapel where besitzer = v_me) >= 10 then
    raise exception 'Höchstens zehn eigene Gruppen-Stapel';
  end if;
  if public.post_rejection(coalesce(p_titel, '')) is not null then raise exception 'Dieser Titel geht nicht'; end if;
  loop
    v_code := translate(upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), '01', 'XZ');
    exit when not exists (select 1 from public.gruppen_stapel where code = v_code)
          and not exists (select 1 from public.ligen where code = v_code);
  end loop;
  insert into public.gruppen_stapel (titel, besitzer, code) values (btrim(p_titel), v_me, v_code) returning id into v_id;
  insert into public.gruppen_stapel_mitglieder (stapel_id, user_id) values (v_id, v_me);
  return jsonb_build_object('id', v_id, 'code', v_code);
end
$fn$;

create or replace function public.gs_beitreten(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_s  public.gruppen_stapel;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  select * into v_s from public.gruppen_stapel
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then return jsonb_build_object('ok', false, 'fehler', 'Diesen Code gibt es nicht.'); end if;
  if (select count(*) from public.gruppen_stapel_mitglieder where stapel_id = v_s.id) >= 30
     and not public.gs_mitglied(v_s.id) then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Gruppe ist voll (30).');
  end if;
  insert into public.gruppen_stapel_mitglieder (stapel_id, user_id) values (v_s.id, v_me) on conflict do nothing;
  return jsonb_build_object('ok', true, 'id', v_s.id, 'titel', v_s.titel);
end
$fn$;

create or replace function public.gs_karte(p_stapel uuid, p_content uuid, p_rein boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  if not public.gs_mitglied(p_stapel) then raise exception 'Du bist nicht in dieser Gruppe'; end if;
  if not coalesce(p_rein, false) then
    delete from public.gruppen_stapel_karten where stapel_id = p_stapel and content_id = p_content;
    return;
  end if;
  if not exists (select 1 from public.content_items where id = p_content and status = 'approved') then
    raise exception 'Diese Karte gibt es nicht mehr';
  end if;
  if (select count(*) from public.gruppen_stapel_karten where stapel_id = p_stapel) >= 50 then
    raise exception 'Höchstens 50 Karten in einem Stapel';
  end if;
  insert into public.gruppen_stapel_karten (stapel_id, content_id, von) values (p_stapel, p_content, auth.uid())
  on conflict do nothing;
end
$fn$;

create or replace function public.gs_verlassen(p_stapel uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  if exists (select 1 from public.gruppen_stapel where id = p_stapel and besitzer = auth.uid()) then
    delete from public.gruppen_stapel where id = p_stapel;
  else
    delete from public.gruppen_stapel_mitglieder where stapel_id = p_stapel and user_id = auth.uid();
  end if;
end
$fn$;

create or replace function public.meine_gruppen_stapel()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'titel', s.titel, 'code', s.code,
           'meiner', s.besitzer = auth.uid(),
           'leute', (select count(*) from public.gruppen_stapel_mitglieder m where m.stapel_id = s.id),
           'karten', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'content_id', ci.id, 'title', ci.title, 'category', ci.primary_category_id,
                      'von', coalesce(nullif(trim(p.display_name), ''), p.handle)
                    ) order by k.at), '[]'::jsonb)
               from public.gruppen_stapel_karten k
               join public.content_items ci on ci.id = k.content_id and ci.status = 'approved'
               left join public.profiles p on p.id = k.von
              where k.stapel_id = s.id)
         ) order by s.created_at desc), '[]'::jsonb)
    from public.gruppen_stapel s
    join public.gruppen_stapel_mitglieder me on me.stapel_id = s.id and me.user_id = auth.uid();
$fn$;

revoke execute on function public.gs_erstellen(text), public.gs_beitreten(text),
  public.gs_karte(uuid, uuid, boolean), public.gs_verlassen(uuid), public.meine_gruppen_stapel() from anon;
grant execute on function public.gs_erstellen(text), public.gs_beitreten(text),
  public.gs_karte(uuid, uuid, boolean), public.gs_verlassen(uuid), public.meine_gruppen_stapel() to authenticated;

do $test$
declare
  v_a uuid;
  v_b uuid;
  v_k uuid;
  v_j jsonb;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  select id into v_k from public.content_items where status = 'approved' limit 1;
  if v_b is null or v_k is null then raise notice 'Selbsttest 0106: zu wenig Daten'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_j := public.gs_erstellen('Selbsttest Schularbeit');
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_j := public.gs_beitreten(v_j->>'code');
    perform public.gs_karte((v_j->>'id')::uuid, v_k, true);
    if jsonb_array_length(public.meine_gruppen_stapel()->0->'karten') <> 1 then
      raise exception 'Selbsttest 0106: Karte nicht im Stapel';
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0106: ok';
end
$test$;

notify pgrst, 'reload schema';
