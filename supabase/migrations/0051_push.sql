-- =============================================================================
-- 0051_push.sql  ·  Push-Benachrichtigungen
--
-- Zwei Anlaesse, ausdruecklich gewuenscht: jemand folgt dir, jemand dem
-- du folgst hat etwas gerepostet.
--
-- Der Aufbau in einem Satz
-- ------------------------
-- Die Datenbank SCHREIBT Benachrichtigungen (Trigger auf follows und
-- reposts), ein Versender HOLT sie ab und schickt sie los. Dazwischen
-- liegt eine Tabelle, kein direkter Aufruf.
--
-- Warum diese Trennung, obwohl sie eine Verzoegerung einbaut: eine
-- Datenbank, die beim Speichern eines Klicks auf einen fremden Server
-- wartet, ist eine Datenbank, die haengt, wenn der fremde Server haengt.
-- Jemandem zu folgen wuerde dann scheitern, weil Googles Push-Dienst
-- gerade langsam ist. Die Tabelle entkoppelt das: der Klick ist sofort
-- fertig, die Nachricht geht hinterher.
--
-- Was das kostet, steht auch hier: der Versender laeuft im selben
-- GitHub-Workflow wie die Pipeline, also alle drei Stunden. "X folgt dir"
-- kommt damit im Schnitt anderthalb Stunden zu spaet. Fuer den Anfang
-- akzeptabel, auf Dauer nicht - der naechste Schritt waere eine
-- Edge Function am Datenbank-Webhook, die in Sekunden zustellt und im
-- Gratiskontingent liegt. Das ist bewusst noch nicht gebaut, weil es
-- einen Deploy-Weg braucht, den es hier noch nicht gibt.
-- =============================================================================

-- --- Wohin geschickt wird ---------------------------------------------------
--
-- Ein Geraet = eine Zeile. Dieselbe Person auf Handy und Laptop hat zwei.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- Die Adresse, an die der Push-Dienst des Browsers zustellt. Eindeutig:
  -- derselbe Browser meldet nach einem Neuladen dieselbe an, und daraus
  -- darf keine zweite Zeile werden.
  endpoint    text not null unique,
  -- Die beiden Schluessel aus der Browser-Anmeldung. Ohne sie kann der
  -- Versender die Nachricht nicht verschluesseln.
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  -- Push-Dienste antworten mit 404 oder 410, wenn eine Anmeldung tot ist
  -- (App deinstalliert, Berechtigung entzogen). Nach ein paar Fehlschlaegen
  -- fliegt die Zeile raus, sonst schickt der Versender bis in alle
  -- Ewigkeit an Geraete, die es nicht mehr gibt.
  fail_count  int not null default 0
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Nur die eigenen. Eine fremde Endpoint-Adresse zu kennen reicht aus, um
-- jemandem Benachrichtigungen zu schicken - das ist nichts, was andere
-- lesen duerfen.
drop policy if exists "push subs own" on public.push_subscriptions;
create policy "push subs own" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- --- Was geschickt wird -----------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('follow', 'repost', 'review', 'streak')),
  title      text not null,
  body       text not null,
  -- Wohin der Klick fuehrt, als Pfad innerhalb der App.
  url        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  read_at    timestamptz,
  -- Verhindert dieselbe Meldung zweimal: wer entfolgt und wieder folgt,
  -- loest sonst eine zweite aus.
  dedupe_key text
);
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists notifications_unsent_idx
  on public.notifications (created_at)
  where sent_at is null;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));


-- --- Einstellung ------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_social boolean not null default true;


-- =============================================================================
-- Die Ausloeser
-- =============================================================================

-- --- Jemand folgt dir -------------------------------------------------------
create or replace function public.on_follow_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name text;
  v_handle text;
begin
  -- Wer nicht will, bekommt nichts. Die Pruefung gehoert hierher und
  -- nicht in den Versender: eine Nachricht, die nie entstehen soll, soll
  -- auch nicht erst in der Tabelle liegen.
  if not exists (select 1 from public.profiles
                  where id = new.followee_id and notify_social) then
    return new;
  end if;

  select coalesce(nullif(display_name, ''), handle), handle
    into v_name, v_handle
    from public.profiles where id = new.follower_id;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (
    new.followee_id,
    'follow',
    'Neuer Follower',
    coalesce(v_name, 'Jemand') || ' folgt dir jetzt.',
    '/u/' || coalesce(v_handle, ''),
    'follow:' || new.follower_id::text
  )
  on conflict do nothing;

  return new;
end
$fn$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.on_follow_notify();


-- --- Jemand, dem du folgst, hat etwas geteilt -------------------------------
create or replace function public.on_repost_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name  text;
  v_title text;
begin
  select coalesce(nullif(display_name, ''), handle) into v_name
    from public.profiles where id = new.user_id;
  select title into v_title
    from public.content_items where id = new.content_id;

  -- An alle Follower. Das `limit` ist kein Geiz, sondern eine Bremse:
  -- ohne sie erzeugt ein einziger Repost bei jemandem mit zehntausend
  -- Followern zehntausend Zeilen in einer Transaktion - und der Repost
  -- selbst wartet darauf.
  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  select f.follower_id,
         'repost',
         coalesce(v_name, 'Jemand') || ' hat geteilt',
         coalesce(v_title, 'Eine Karte'),
         '/reel/' || new.content_id::text,
         'repost:' || new.id::text
    from public.follows f
    join public.profiles p on p.id = f.follower_id
   where f.followee_id = new.user_id
     and p.notify_social
   limit 200
  on conflict do nothing;

  return new;
end
$fn$;

drop trigger if exists reposts_notify on public.reposts;
create trigger reposts_notify
  after insert on public.reposts
  for each row execute function public.on_repost_notify();


-- =============================================================================
-- Was die App aufruft
-- =============================================================================

create or replace function public.register_push(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set
    -- Dasselbe Geraet kann den Besitzer wechseln: zwei Konten in einem
    -- Browser. Dann gehoert die Anmeldung dem zuletzt angemeldeten.
    user_id    = excluded.user_id,
    p256dh     = excluded.p256dh,
    auth       = excluded.auth,
    user_agent = excluded.user_agent,
    fail_count = 0;
end
$fn$;
grant execute on function public.register_push(text, text, text, text) to authenticated;


create or replace function public.unregister_push(p_endpoint text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
end
$fn$;
grant execute on function public.unregister_push(text) to authenticated;


-- --- Die Glocke in der App --------------------------------------------------
create or replace function public.my_notifications(p_limit int default 30)
returns setof public.notifications
language sql stable security definer set search_path = ''
as $fn$
  select * from public.notifications
   where user_id = auth.uid()
   order by created_at desc
   limit least(greatest(p_limit, 1), 100);
$fn$;
grant execute on function public.my_notifications(int) to authenticated;


create or replace function public.mark_notifications_read()
returns void
language sql security definer set search_path = ''
as $fn$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
$fn$;
grant execute on function public.mark_notifications_read() to authenticated;
