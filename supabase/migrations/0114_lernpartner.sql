-- =============================================================================
-- 0114_lernpartner.sql  ·  Zu zweit: ein gemeinsames Wochenziel
--
-- Zwei Leute verabreden ein Wochenziel (gelesene Karten) und sehen, wie weit
-- der andere diese Woche ist. Mehr nicht: kein Verlauf einzelner Karten,
-- keine Themen - nur die eine Zahl, auf die man sich geeinigt hat.
--
-- Ablauf: Anfrage per @Name -> die andere Person nimmt an oder lehnt ab
-- (Meldung 'lernpartner'). Aktiv: beide sehen ihre Wochenzahl, die Serie
-- gemeinsam geschaffter Wochen, und koennen einmal am Tag anstupsen.
--
-- Gezaehlt wird aus xp_ledger (kind 'read') - dieselbe Quelle wie der
-- Wochenrueckblick (0105), Woche ab Montag, Zeitzone Europe/Vienna.
-- Hoechstens 5 Partnerschaften (offen + aktiv) je Person.
-- =============================================================================

create table if not exists public.lernpartner (
  id         uuid primary key default gen_random_uuid(),
  von        uuid not null references public.profiles(id) on delete cascade,
  an         uuid not null references public.profiles(id) on delete cascade,
  ziel       smallint not null check (ziel between 5 and 300),
  status     text not null default 'offen' check (status in ('offen', 'aktiv')),
  created_at timestamptz not null default now(),
  aktiv_seit timestamptz,
  check (von <> an)
);
create unique index if not exists lernpartner_paar_uidx
  on public.lernpartner (least(von, an), greatest(von, an));
alter table public.lernpartner enable row level security;
revoke all on public.lernpartner from anon, authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel',
                  'comment_like', 'mention', 'rueckblick', 'wunsch', 'lernpartner'));

-- Gelesene Karten in der Woche, die mit p_montag beginnt.
create or replace function public.lp_woche(p_user uuid, p_montag date)
returns int
language sql stable security definer set search_path = ''
as $fn$
  select count(*)::int from public.xp_ledger
   where user_id = p_user and kind = 'read'
     and created_at >= (p_montag::timestamp at time zone 'Europe/Vienna')
     and created_at <  ((p_montag + 7)::timestamp at time zone 'Europe/Vienna');
$fn$;
revoke execute on function public.lp_woche(uuid, date) from anon, authenticated;

create or replace function public.lp_name(p_user uuid)
returns text
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(nullif(btrim(display_name), ''), handle) from public.profiles where id = p_user;
$fn$;
revoke execute on function public.lp_name(uuid) from anon, authenticated;

create or replace function public.lp_anfragen(p_handle text, p_ziel int)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me  uuid := auth.uid();
  v_an  uuid;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  select id into v_an from public.profiles where lower(handle) = lower(ltrim(btrim(p_handle), '@'));
  if v_an is null then raise exception 'Diesen Namen gibt es nicht'; end if;
  if v_an = v_me then raise exception 'Mit dir selbst geht das nicht'; end if;
  if p_ziel is null or p_ziel < 5 or p_ziel > 300 then raise exception 'Ziel: 5 bis 300 Karten'; end if;
  if (select count(*) from public.lernpartner where v_me in (von, an)) >= 5 then
    raise exception 'Höchstens fünf Lernpartner';
  end if;
  if exists (select 1 from public.lernpartner
              where least(von, an) = least(v_me, v_an) and greatest(von, an) = greatest(v_me, v_an)) then
    raise exception 'Ihr seid schon verbunden oder angefragt';
  end if;
  insert into public.lernpartner (von, an, ziel) values (v_me, v_an, p_ziel);
  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (v_an, 'lernpartner', 'Lernpartner?',
          public.lp_name(v_me) || ' möchte mit dir ' || p_ziel || ' Karten pro Woche schaffen.',
          '/lernpartner', 'lp_anfrage:' || v_me::text || ':' || v_an::text)
  on conflict do nothing;
end
$fn$;

create or replace function public.lp_antworten(p_id uuid, p_ja boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_l public.lernpartner;
begin
  select * into v_l from public.lernpartner where id = p_id and an = auth.uid() and status = 'offen';
  if v_l.id is null then raise exception 'Anfrage nicht gefunden'; end if;
  if p_ja then
    update public.lernpartner set status = 'aktiv', aktiv_seit = now() where id = p_id;
    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    values (v_l.von, 'lernpartner', 'Ihr lernt jetzt zu zweit',
            public.lp_name(v_l.an) || ' ist dabei: ' || v_l.ziel || ' Karten pro Woche.',
            '/lernpartner', 'lp_ja:' || p_id::text)
    on conflict do nothing;
  else
    delete from public.lernpartner where id = p_id;
  end if;
end
$fn$;

-- Beide duerfen das Ziel aendern und beenden.
create or replace function public.lp_ziel(p_id uuid, p_ziel int)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_ziel is null or p_ziel < 5 or p_ziel > 300 then raise exception 'Ziel: 5 bis 300 Karten'; end if;
  update public.lernpartner set ziel = p_ziel where id = p_id and auth.uid() in (von, an);
end
$fn$;

create or replace function public.lp_beenden(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.lernpartner where id = p_id and auth.uid() in (von, an);
$fn$;

-- Einmal am Tag je Partnerschaft und Richtung.
create or replace function public.lp_anstupsen(p_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me  uuid := auth.uid();
  v_l   public.lernpartner;
  v_ziel uuid;
  v_n   int;
begin
  select * into v_l from public.lernpartner where id = p_id and status = 'aktiv' and v_me in (von, an);
  if v_l.id is null then raise exception 'Nicht gefunden'; end if;
  v_ziel := case when v_l.von = v_me then v_l.an else v_l.von end;
  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (v_ziel, 'lernpartner', 'Anstupser',
          public.lp_name(v_me) || ' erinnert dich an euer Wochenziel.',
          '/lernpartner',
          'lp_stups:' || p_id::text || ':' || v_me::text || ':' || (now() at time zone 'Europe/Vienna')::date::text)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$fn$;

create or replace function public.meine_lernpartner()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with montag as (
    select date_trunc('week', now() at time zone 'Europe/Vienna')::date as m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'status', l.status, 'ziel', l.ziel,
           'eingehend', l.an = auth.uid() and l.status = 'offen',
           'partner', jsonb_build_object('handle', p.handle, 'name', public.lp_name(p.id),
                                         'avatar_path', p.avatar_path),
           'ich', case when l.status = 'aktiv' then public.lp_woche(auth.uid(), (select m from montag)) end,
           'er',  case when l.status = 'aktiv' then public.lp_woche(p.id, (select m from montag)) end,
           -- Wochen in Folge (vor dieser), in denen BEIDE das Ziel geschafft haben.
           'serie', case when l.status = 'aktiv' then (
             select coalesce(min(w) - 1, 8) from generate_series(1, 8) w
              where (select m from montag) - 7 * w < (l.aktiv_seit at time zone 'Europe/Vienna')::date - 6
                 or public.lp_woche(auth.uid(), (select m from montag) - 7 * w) < l.ziel
                 or public.lp_woche(p.id, (select m from montag) - 7 * w) < l.ziel) end)
         order by l.status, l.created_at), '[]'::jsonb)
    from public.lernpartner l
    join public.profiles p on p.id = case when l.von = auth.uid() then l.an else l.von end
   where auth.uid() in (l.von, l.an);
$fn$;

revoke execute on function public.lp_anfragen(text, int), public.lp_antworten(uuid, boolean),
  public.lp_ziel(uuid, int), public.lp_beenden(uuid), public.lp_anstupsen(uuid),
  public.meine_lernpartner() from anon;
grant execute on function public.lp_anfragen(text, int), public.lp_antworten(uuid, boolean),
  public.lp_ziel(uuid, int), public.lp_beenden(uuid), public.lp_anstupsen(uuid),
  public.meine_lernpartner() to authenticated;

do $test$
declare
  v_a uuid;
  v_b uuid;
  v_hb text;
  v_j jsonb;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id, handle into v_b, v_hb from public.profiles where id <> v_a order by created_at limit 1;
  if v_b is null then raise notice 'Selbsttest 0114: zu wenig Konten'; return; end if;
  begin
    delete from public.lernpartner
     where least(von, an) = least(v_a, v_b) and greatest(von, an) = greatest(v_a, v_b);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.lp_anfragen('@' || v_hb, 20);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_j := public.meine_lernpartner();
    if not (v_j->0->>'eingehend')::boolean then raise exception 'Selbsttest 0114: Anfrage fehlt: %', v_j; end if;
    perform public.lp_antworten((v_j->0->>'id')::uuid, true);
    v_j := public.meine_lernpartner();
    if v_j->0->>'status' <> 'aktiv' or (v_j->0->>'ich') is null or (v_j->0->>'serie') is null then
      raise exception 'Selbsttest 0114: nicht aktiv: %', v_j;
    end if;
    if not public.lp_anstupsen((v_j->0->>'id')::uuid) then raise exception 'Selbsttest 0114: Stupser'; end if;
    if public.lp_anstupsen((v_j->0->>'id')::uuid) then raise exception 'Selbsttest 0114: zweimal gestupst'; end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0114: ok';
end
$test$;

notify pgrst, 'reload schema';
