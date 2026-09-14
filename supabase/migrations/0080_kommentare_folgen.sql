-- =============================================================================
-- 0080_kommentare_folgen.sql  ·  Kommentare liken, Absaetze, und wer woher folgt
--
-- Drei Wuensche aus einer Liste:
--
-- 1. Kommentare unter Beitraegen liken (Antworten und Teilen gab es schon
--    bzw. brauchen keine Datenbank - geteilt wird ein Link auf den Beitrag,
--    der zum Kommentar springt).
--
-- 2. Absaetze in Beitraegen. Die gingen technisch schon: das Eingabefeld
--    nimmt Zeilenumbrueche, gespeichert wurde der Text unveraendert, und die
--    App zeigt ihn mit white-space: pre-wrap. Was fehlte, ist das Aufraeumen
--    drumherum - btrim() entfernt nur LEERZEICHEN, keine Zeilenumbrueche.
--    Ein Beitrag mit fuenf Leerzeilen am Ende stand mit fuenf Leerzeilen im
--    Home. Jetzt: Umbrueche vorn und hinten weg, hoechstens eine Leerzeile
--    am Stueck, \r\n wird zu \n.
--
-- 3. Eine Statistik, die zeigt, wie viele Follower man hat - ueber die Zeit -
--    und wie viele davon ein Beitrag gebracht hat. Beides laesst sich aus
--    dem Bestand NICHT berechnen:
--      - Entfolgen loescht die Zeile in `follows`. Ein Verlauf kennt damit
--        nur die Follower, die heute noch da sind.
--      - Woher ein Follow kam, stand nirgends.
--    Deshalb eine Mitschrift, die ab jetzt laeuft (follow_events). Was vor
--    dieser Migration geschah, wird aus `follows` nachgetragen und als
--    `nachgetragen` markiert - die App schreibt dazu, ab wann es genau ist.
--    Daten, die heute nicht aufgeschrieben werden, fehlen spaeter fuer immer;
--    darum kommt die Mitschrift vor der Statistik-Seite, nicht mit ihr.
-- =============================================================================


-- --- Text aufraeumen -------------------------------------------------------------
create or replace function public.absaetze_saeubern(p text)
returns text
language sql immutable set search_path = ''
as $fn$
  select btrim(
           regexp_replace(
             regexp_replace(
               replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\r', E'\n'),
               -- Leerzeichen am Zeilenende: unsichtbar, aber sie machen aus
               -- einer "leeren" Zeile eine nicht-leere, und dann greift die
               -- naechste Regel nicht.
               E'[ \t]+\n', E'\n', 'g'),
             E'\n{3,}', E'\n\n', 'g'),
           E' \n\t');
$fn$;
revoke execute on function public.absaetze_saeubern(text) from anon, authenticated;


-- --- Beitrag schreiben (vollstaendig aus 0077, zwei Zeilen geaendert) --------------
create or replace function public.create_post(
  p_body       text,
  p_art        text default 'post',
  p_content_id uuid default null,
  p_repost_of  uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  -- 0080: aufraeumen statt nur btrim - siehe Kopf, Punkt 2.
  v_body   text := public.absaetze_saeubern(p_body);
  v_art    text := coalesce(p_art, 'post');
  v_ziel   uuid := p_repost_of;
  v_reject text;
  v_id     uuid;
  v_heute  int;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if v_art not in ('post', 'frage') then raise exception 'Unbekannte Beitragsart'; end if;
  if length(v_body) > 500 then raise exception 'Höchstens 500 Zeichen'; end if;
  if length(v_body) < 2 and p_content_id is null and p_repost_of is null then
    raise exception 'Schreib mindestens zwei Zeichen';
  end if;

  if p_content_id is not null and not exists (
    select 1 from public.content_items where id = p_content_id and status = 'approved'
  ) then
    raise exception 'Diese Karte gibt es nicht mehr';
  end if;

  if p_repost_of is not null then
    if not public.post_sichtbar(p_repost_of, v_me) then
      raise exception 'Diesen Beitrag gibt es nicht mehr';
    end if;
    -- Ein Repost eines reinen Reposts zeigt auf das Original. Sonst stapeln
    -- sich leere Huellen, und der eigentliche Text rutscht immer tiefer.
    select case when length(o.body) = 0 and o.repost_of is not null then o.repost_of else o.id end
      into v_ziel
      from public.posts o where o.id = p_repost_of;
  end if;

  select count(*) into v_heute
    from public.posts where user_id = v_me and created_at > now() - interval '24 hours';
  if v_heute >= 30 then
    raise exception 'Genug für heute: höchstens 30 Beiträge am Tag';
  end if;

  if length(v_body) > 0 then
    v_reject := public.post_rejection(v_body);
  end if;

  insert into public.posts (user_id, art, body, content_id, repost_of, status, block_reason)
  values (v_me, v_art, v_body, p_content_id, v_ziel,
          case when v_reject is null then 'visible' else 'blocked' end, v_reject)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_reject is null then 'visible' else 'blocked' end,
    'reason', v_reject);
end
$fn$;
grant execute on function public.create_post(text, text, uuid, uuid) to authenticated;


-- --- Kommentar schreiben (vollstaendig aus 0077, eine Zeile geaendert) -------------
create or replace function public.add_post_comment(
  p_post   uuid,
  p_body   text,
  p_parent uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  v_body   text := public.absaetze_saeubern(p_body);
  v_reject text;
  v_id     uuid;
  v_heute  int;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if length(v_body) < 2 or length(v_body) > 500 then
    raise exception 'Kommentar muss zwischen 2 und 500 Zeichen lang sein';
  end if;
  if not public.post_sichtbar(p_post, v_me) then raise exception 'Beitrag nicht sichtbar'; end if;

  if p_parent is not null and not exists (
    select 1 from public.post_comments
     where id = p_parent and post_id = p_post and parent_id is null and status = 'visible'
  ) then
    raise exception 'Antwort ohne Kommentar';
  end if;

  select count(*) into v_heute
    from public.post_comments where user_id = v_me and created_at > now() - interval '24 hours';
  if v_heute >= 100 then
    raise exception 'Genug für heute: höchstens 100 Kommentare am Tag';
  end if;

  v_reject := public.post_rejection(v_body);

  insert into public.post_comments (post_id, user_id, parent_id, body, status, block_reason)
  values (p_post, v_me, p_parent, v_body,
          case when v_reject is null then 'visible' else 'blocked' end, v_reject)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_reject is null then 'visible' else 'blocked' end,
    'reason', v_reject);
end
$fn$;
grant execute on function public.add_post_comment(uuid, text, uuid) to authenticated;


-- --- Kommentar-Likes -----------------------------------------------------------------
create table if not exists public.post_comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.post_comment_likes enable row level security;
revoke all on public.post_comment_likes from anon, authenticated;

create or replace function public.set_post_comment_like(p_comment uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_post uuid;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  select post_id into v_post from public.post_comments where id = p_comment and status = 'visible';
  if v_post is null or not public.post_sichtbar(v_post, v_me) then
    raise exception 'Kommentar nicht sichtbar';
  end if;
  if p_on then
    insert into public.post_comment_likes (comment_id, user_id) values (p_comment, v_me)
    on conflict do nothing;
  else
    delete from public.post_comment_likes where comment_id = p_comment and user_id = v_me;
  end if;
end
$fn$;
grant execute on function public.set_post_comment_like(uuid, boolean) to authenticated;


-- Glocke: "X gefaellt dein Kommentar". Wie post_like (0078) nur in der Glocke,
-- ohne Push - aus demselben Grund.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel',
                  'comment_like'));

create or replace function public.on_post_comment_like_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_autor uuid;
  v_text  text;
  v_post  uuid;
begin
  select user_id, body, post_id into v_autor, v_text, v_post
    from public.post_comments where id = new.comment_id;
  if v_autor is null or v_autor = new.user_id or not public.will_sozial(v_autor) then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key, sent_at)
  values (
    v_autor, 'comment_like',
    public.anzeigename(new.user_id) || ' gefällt dein Kommentar',
    left(v_text, 100),
    '/post/' || v_post::text || '?kommentar=' || new.comment_id::text,
    'comment_like:' || new.comment_id::text || ':' || new.user_id::text,
    now()
  )
  on conflict do nothing;
  return new;
end
$fn$;

drop trigger if exists post_comment_likes_notify on public.post_comment_likes;
create trigger post_comment_likes_notify
  after insert on public.post_comment_likes
  for each row execute function public.on_post_comment_like_notify();


-- --- Beitrag lesen (vollstaendig aus 0077, Kommentare mit Likes) -----------------------
create or replace function public.get_post(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_autor uuid;
  v_p     public.profiles;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select user_id into v_autor from public.posts where id = p_id and status = 'visible';
  if not found then raise exception 'Diesen Beitrag gibt es nicht mehr'; end if;

  -- Nicht sichtbar heisst hier nicht Fehler, sondern "folge erst": ein
  -- geteilter Link soll sagen, wessen Beitrag es ist.
  if not public.post_sichtbar(p_id, v_me) then
    select * into v_p from public.profiles where id = v_autor;
    return jsonb_build_object(
      'gesperrt', true,
      'wer', jsonb_build_object(
               'handle', v_p.handle,
               'name', coalesce(nullif(trim(v_p.display_name), ''), v_p.handle),
               'avatar_seed', v_p.avatar_seed, 'avatar_path', v_p.avatar_path,
               'ich', false));
  end if;

  return jsonb_build_object(
    'gesperrt', false,
    'post', public.post_json(p_id, v_me),
    'kommentare', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'body', c.body, 'at', c.created_at,
               'wer', jsonb_build_object(
                        'handle', cp.handle,
                        'name', coalesce(nullif(trim(cp.display_name), ''), cp.handle),
                        'avatar_seed', cp.avatar_seed, 'avatar_path', cp.avatar_path,
                        'ich', cp.id = v_me),
               'ist_meins', c.user_id = v_me,
               'darf_loeschen', c.user_id = v_me or v_autor = v_me,
               'likes', (select count(*) from public.post_comment_likes l where l.comment_id = c.id),
               'ich_like', exists (select 1 from public.post_comment_likes l
                                    where l.comment_id = c.id and l.user_id = v_me),
               'antworten', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', a.id, 'body', a.body, 'at', a.created_at,
                          'wer', jsonb_build_object(
                                   'handle', ap.handle,
                                   'name', coalesce(nullif(trim(ap.display_name), ''), ap.handle),
                                   'avatar_seed', ap.avatar_seed, 'avatar_path', ap.avatar_path,
                                   'ich', ap.id = v_me),
                          'ist_meins', a.user_id = v_me,
                          'darf_loeschen', a.user_id = v_me or v_autor = v_me,
                          'likes', (select count(*) from public.post_comment_likes l where l.comment_id = a.id),
                          'ich_like', exists (select 1 from public.post_comment_likes l
                                               where l.comment_id = a.id and l.user_id = v_me),
                          'antworten', '[]'::jsonb
                        ) order by a.created_at)
                   from public.post_comments a
                   join public.profiles ap on ap.id = a.user_id
                  where a.parent_id = c.id and a.status = 'visible'
               ), '[]'::jsonb)
             ) order by c.created_at)
        from public.post_comments c
        join public.profiles cp on cp.id = c.user_id
       where c.post_id = p_id and c.parent_id is null and c.status = 'visible'
    ), '[]'::jsonb));
end
$fn$;
grant execute on function public.get_post(uuid) to authenticated;


-- --- Mitschrift: wer folgt, wer geht, und woher ----------------------------------------
create table if not exists public.follow_events (
  id           bigint generated always as identity primary key,
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  followee_id  uuid not null references public.profiles(id) on delete cascade,
  art          text not null check (art in ('folgt', 'entfolgt')),
  --: Wo der Knopf gedrueckt wurde. null = unbekannt (Einladung, Altbestand).
  quelle       text check (quelle in ('beitrag', 'home', 'profil', 'suche', 'liste')),
  --: Bei quelle = 'beitrag': ueber welchen Beitrag die Person aufs Profil kam.
  post_id      uuid references public.posts(id) on delete set null,
  --: Aus `follows` rekonstruiert, nicht mitgeschrieben - siehe Kopf.
  nachgetragen boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists follow_events_followee_idx on public.follow_events (followee_id, created_at);
create index if not exists follow_events_post_idx on public.follow_events (post_id) where post_id is not null;

alter table public.follow_events enable row level security;
revoke all on public.follow_events from anon, authenticated;

-- Die Quelle kommt nicht als Spalte in `follows` - sonst muesste jede Stelle,
-- die dort schreibt (auch die Einladung aus 0071), davon wissen. Sie kommt
-- als Einstellung fuer die laufende Transaktion aus set_following, und der
-- Trigger liest sie. Wer ohne set_following schreibt, hinterlaesst null.
create or replace function public.tg_follow_events()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_quelle text := nullif(current_setting('elycic.folgen_quelle', true), '');
  v_post   text := nullif(current_setting('elycic.folgen_beitrag', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.follow_events (follower_id, followee_id, art, quelle, post_id)
    values (new.follower_id, new.followee_id, 'folgt', v_quelle,
            case when v_quelle = 'beitrag' then v_post::uuid end);
  elsif tg_op = 'DELETE' then
    -- Nicht, wenn die Zeile verschwindet, weil ein Konto geloescht wird: dann
    -- fehlt das Profil schon, der Eintrag verletzte den Fremdschluessel, und
    -- die Loeschung des Kontos (DSGVO, 0013) wuerde daran scheitern.
    if exists (select 1 from public.profiles where id = old.follower_id)
       and exists (select 1 from public.profiles where id = old.followee_id) then
      insert into public.follow_events (follower_id, followee_id, art)
      values (old.follower_id, old.followee_id, 'entfolgt');
    end if;
  end if;
  return null;
end
$fn$;

drop trigger if exists follows_events on public.follows;
create trigger follows_events
  after insert or delete on public.follows
  for each row execute function public.tg_follow_events();

-- Altbestand: jeder heutige Follow als "folgt" zu seinem echten Zeitpunkt.
-- Nur beim ersten Einspielen (die Tabelle ist dann leer).
insert into public.follow_events (follower_id, followee_id, art, nachgetragen, created_at)
select f.follower_id, f.followee_id, 'folgt', true, f.created_at
  from public.follows f
 where not exists (select 1 from public.follow_events);


-- Neue Signatur: zwei optionale Parameter. drop + create, weil PostgREST
-- sonst zwei Funktionen gleichen Namens sieht und beim Aufruf mit zwei
-- Argumenten nicht weiss, welche gemeint ist.
drop function if exists public.set_following(uuid, boolean);

create or replace function public.set_following(
  p_user   uuid,
  p_follow boolean,
  p_quelle text default null,
  p_post   uuid default null
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  v_quelle text := case when p_quelle in ('beitrag', 'home', 'profil', 'suche', 'liste')
                        then p_quelle end;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_user then raise exception 'cannot follow yourself'; end if;

  if p_follow then
    -- Ein Beitrag zaehlt nur, wenn er von der Person ist, der man folgt -
    -- sonst liesse sich jedem beliebigen Beitrag ein Follower zuschreiben.
    if v_quelle = 'beitrag' and not exists (
      select 1 from public.posts where id = p_post and user_id = p_user
    ) then
      v_quelle := 'profil';
    end if;
    perform set_config('elycic.folgen_quelle', coalesce(v_quelle, ''), true);
    perform set_config('elycic.folgen_beitrag',
                       case when v_quelle = 'beitrag' then p_post::text else '' end, true);
    insert into public.follows (follower_id, followee_id)
    values (v_me, p_user) on conflict do nothing;
  else
    delete from public.follows where follower_id = v_me and followee_id = p_user;
  end if;
end
$fn$;
grant execute on function public.set_following(uuid, boolean, text, uuid) to authenticated;

notify pgrst, 'reload schema';
