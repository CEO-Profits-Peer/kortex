-- =============================================================================
-- 0078_benachrichtigungen.sql  ·  Wer reagiert, soll gehoert werden
--
-- Mit 0077 kann man posten, liken, kommentieren und teilen. Erfahren hat
-- davon niemand etwas: Benachrichtigungen gab es nur fuer "folgt dir" und
-- "hat eine Karte geteilt" (0051). Wer einen Beitrag schreibt und nie
-- mitbekommt, dass jemand geantwortet hat, schreibt keinen zweiten.
--
-- Neu, und warum so
-- -----------------
--   post_like      "X gefaellt dein Beitrag" - NUR in der Glocke, ohne Push.
--                  Ein Push je Herz waere bei einem gut laufenden Beitrag
--                  zwanzig Brummer in einer Stunde, und die erste Reaktion
--                  darauf ist, Push ganz abzuschalten. sent_at wird deshalb
--                  gleich gesetzt; die Edge Function ueberspringt die Zeile.
--   post_comment   an den Autor des Beitrags
--   comment_reply  an den, dessen Kommentar beantwortet wurde - unter
--                  Beitraegen UND unter Karten (das fehlte auch dort)
--   post_repost    an den Autor, wenn jemand seinen Beitrag weiterteilt
--   duel           an den Herausgeforderten. Ein Duell laeuft 24 Stunden;
--                  wer davon erst beim naechsten zufaelligen Oeffnen der App
--                  erfaehrt, hat es meist verpasst.
--
-- Alle beachten notify_social, niemand bekommt eine Meldung ueber sich
-- selbst, und jede hat einen dedupe_key - ein Like weg und wieder dran
-- erzeugt keine zweite Zeile.
--
-- Dazu zwei Lesefunktionen: die Zahl ungelesener Meldungen (fuer den Punkt
-- an der Glocke) und die Beitraege einer Person (fuer das Profil).
-- =============================================================================


-- --- Neue Arten --------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel'));


-- --- Hilfe: wie jemand heisst -------------------------------------------------
create or replace function public.anzeigename(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(nullif(trim(display_name), ''), handle, 'Jemand')
    from public.profiles where id = p_id;
$fn$;
revoke execute on function public.anzeigename(uuid) from anon, authenticated;

create or replace function public.will_sozial(p_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select coalesce((select notify_social from public.profiles where id = p_id), false);
$fn$;
revoke execute on function public.will_sozial(uuid) from anon, authenticated;


-- --- Like auf einen Beitrag ------------------------------------------------------
create or replace function public.on_post_like_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_autor uuid;
  v_text  text;
begin
  select user_id, body into v_autor, v_text from public.posts where id = new.post_id;
  if v_autor is null or v_autor = new.user_id or not public.will_sozial(v_autor) then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key, sent_at)
  values (
    v_autor, 'post_like',
    public.anzeigename(new.user_id) || ' gefällt dein Beitrag',
    coalesce(nullif(left(v_text, 100), ''), 'Dein geteilter Beitrag'),
    '/post/' || new.post_id::text,
    'post_like:' || new.post_id::text || ':' || new.user_id::text,
    -- Gleich als "verschickt" markiert: nur Glocke, kein Push. Siehe Kopf.
    now()
  )
  on conflict do nothing;
  return new;
end
$fn$;

drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify
  after insert on public.post_likes
  for each row execute function public.on_post_like_notify();


-- --- Kommentar unter einem Beitrag, Antwort darauf ---------------------------------
create or replace function public.on_post_comment_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_autor  uuid;
  v_eltern uuid;
  v_name   text := public.anzeigename(new.user_id);
begin
  select user_id into v_autor from public.posts where id = new.post_id;

  if v_autor is not null and v_autor <> new.user_id and public.will_sozial(v_autor) then
    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    values (v_autor, 'post_comment', v_name || ' hat deinen Beitrag kommentiert',
            left(new.body, 140), '/post/' || new.post_id::text,
            'post_comment:' || new.id::text)
    on conflict do nothing;
  end if;

  if new.parent_id is not null then
    select user_id into v_eltern from public.post_comments where id = new.parent_id;
    -- Wer schon als Autor des Beitrags benachrichtigt wurde, bekommt keine
    -- zweite Meldung fuer denselben Satz.
    if v_eltern is not null and v_eltern <> new.user_id
       and v_eltern is distinct from v_autor and public.will_sozial(v_eltern) then
      insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
      values (v_eltern, 'comment_reply', v_name || ' hat dir geantwortet',
              left(new.body, 140), '/post/' || new.post_id::text,
              'reply:' || new.id::text)
      on conflict do nothing;
    end if;
  end if;

  return new;
end
$fn$;

-- Nur sichtbare: ein von der Pruefung abgelehnter Kommentar soll nicht als
-- Meldung doch noch beim Empfaenger ankommen.
drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify
  after insert on public.post_comments
  for each row when (new.status = 'visible')
  execute function public.on_post_comment_notify();


-- --- Antwort unter einer Karte ---------------------------------------------------------
create or replace function public.on_comment_reply_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_eltern uuid;
begin
  select user_id into v_eltern from public.comments where id = new.parent_id;
  if v_eltern is null or v_eltern = new.user_id or not public.will_sozial(v_eltern) then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (v_eltern, 'comment_reply', public.anzeigename(new.user_id) || ' hat dir geantwortet',
          left(new.body, 140), '/reel/' || new.content_id::text,
          'reply:' || new.id::text)
  on conflict do nothing;
  return new;
end
$fn$;

drop trigger if exists comments_reply_notify on public.comments;
create trigger comments_reply_notify
  after insert on public.comments
  for each row when (new.parent_id is not null and new.status = 'visible')
  execute function public.on_comment_reply_notify();


-- --- Beitrag weitergeteilt ---------------------------------------------------------------
create or replace function public.on_post_repost_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_autor uuid;
begin
  select user_id into v_autor from public.posts where id = new.repost_of;
  if v_autor is null or v_autor = new.user_id or not public.will_sozial(v_autor) then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (v_autor, 'post_repost', public.anzeigename(new.user_id) || ' hat deinen Beitrag geteilt',
          coalesce(nullif(left(new.body, 140), ''), 'Ohne eigenen Satz dazu.'),
          '/post/' || new.id::text,
          'post_repost:' || new.id::text)
  on conflict do nothing;
  return new;
end
$fn$;

drop trigger if exists posts_repost_notify on public.posts;
create trigger posts_repost_notify
  after insert on public.posts
  for each row when (new.repost_of is not null and new.status = 'visible')
  execute function public.on_post_repost_notify();


-- --- Duell-Herausforderung ------------------------------------------------------------------
create or replace function public.on_duel_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if not public.will_sozial(new.opponent) then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (new.opponent, 'duel', public.anzeigename(new.challenger) || ' fordert dich zum Duell',
          'Fünf Karten, eine Minute, dann die Fragen. Du hast 24 Stunden.',
          '/duel/' || new.id::text,
          'duel:' || new.id::text)
  on conflict do nothing;
  return new;
end
$fn$;

drop trigger if exists duels_notify on public.duels;
create trigger duels_notify
  after insert on public.duels
  for each row execute function public.on_duel_notify();


-- --- Punkt an der Glocke ---------------------------------------------------------------------
create or replace function public.my_unread_notifications()
returns int
language sql stable security definer set search_path = ''
as $fn$
  select count(*)::int from public.notifications
   where user_id = auth.uid() and read_at is null;
$fn$;
grant execute on function public.my_unread_notifications() to authenticated;


-- --- Beitraege einer Person (Profil) ---------------------------------------------------------
--
-- Dieselbe Sichtbarkeit wie im Home: ich selbst und wer folgt. Alle anderen
-- sehen die ANZAHL - wie bei Instagram -, aber nicht den Inhalt. Die Zahl
-- sagt, dass es sich lohnen koennte zu folgen; der Inhalt bleibt bei den
-- Leuten, fuer die er geschrieben wurde.
create or replace function public.get_user_posts(
  p_handle text,
  p_limit  int default 10,
  p_before timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  v_user   uuid;
  v_anzahl int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select id into v_user from public.profiles where handle = p_handle;
  if not found then raise exception 'Profil nicht gefunden'; end if;

  select count(*) into v_anzahl from public.posts where user_id = v_user and status = 'visible';

  if v_user <> v_me and not exists (
    select 1 from public.follows where follower_id = v_me and followee_id = v_user
  ) then
    return jsonb_build_object('gesperrt', true, 'anzahl', v_anzahl, 'posts', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'gesperrt', false,
    'anzahl', v_anzahl,
    'posts', coalesce((
      select jsonb_agg(public.post_json(x.id, v_me) order by x.created_at desc)
        from (
          select id, created_at from public.posts
           where user_id = v_user and status = 'visible'
             and created_at < coalesce(p_before, 'infinity'::timestamptz)
           order by created_at desc
           limit least(greatest(coalesce(p_limit, 10), 1), 50)
        ) x
    ), '[]'::jsonb));
end
$fn$;
grant execute on function public.get_user_posts(text, int, timestamptz) to authenticated;

notify pgrst, 'reload schema';
