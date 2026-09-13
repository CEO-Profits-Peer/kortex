-- =============================================================================
-- 0077_posts.sql  ·  Eigene Beitraege - und ein Home, das nach unten weitergeht
--
-- Gewuenscht: im Studio selbst posten, im Home endlos untereinander, mit
-- Like, Repost, Teilen und Kommentaren an jedem Beitrag.
--
-- Was ein Beitrag ist
-- -------------------
-- Text bis 500 Zeichen, als 'post' oder 'frage'. Optional mit einer Karte
-- daran ("Karte empfehlen" mit eigenem Satz) oder als Repost eines anderen
-- Beitrags (mit oder ohne eigenen Text davor).
--
-- Wer ihn sieht: ich, wer mir folgt - und wer jemandem folgt, der ihn
-- repostet hat. Nicht der Feed. Das war die Absicht: Beitraege von Menschen
-- sind etwas anderes als gepruefte Lernkarten und sollen sich nicht
-- zwischen sie mischen.
--
-- Pruefung
-- --------
-- Dieselbe wie bei Kommentaren (comment_rejection, 0040/0041): Drohungen,
-- Beschimpfungen, Links, Kontaktdaten. Kein zweiter, lockererer Weg - ein
-- Beitrag erreicht mehr Leute als ein Kommentar unter einer Karte. Dazu
-- Melden (drei Meldungen, und er ist weg) und eine Obergrenze je Tag gegen
-- Spam. Abgelehntes wird gespeichert, aber nie gezeigt, wie bei Kommentaren.
--
-- Home, zweite Fassung
-- --------------------
-- get_home bekommt einen Cursor (p_before) und liefert Seite fuer Seite -
-- deshalb drop + create, die Signatur aendert sich. Neu drin: Beitraege, und
-- die EIGENEN Beitraege und Empfehlungen (wer postet, will es sehen). Bei
-- Karten-Empfehlungen kommen Like- und Kommentarzahl und mein Stand mit,
-- damit die Knoepfe darunter stimmen.
--
-- Duelle: nur noch wer gewonnen hat, nicht gegen wen. Damit reicht die
-- Zustimmung des Siegers (leaderboard_opt_in); die Gegenseite taucht gar
-- nicht mehr auf. Unentschieden erscheinen nicht - da gibt es nichts zu
-- zeigen, ohne beide zu nennen.
-- =============================================================================


-- --- Tabellen -----------------------------------------------------------------
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  art          text not null default 'post' check (art in ('post', 'frage')),
  body         text not null default '' check (length(body) <= 500),
  content_id   uuid references public.content_items(id) on delete set null,
  repost_of    uuid references public.posts(id) on delete set null,
  status       text not null default 'visible' check (status in ('visible', 'blocked', 'hidden')),
  block_reason text,
  report_count int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists posts_user_idx on public.posts (user_id, created_at desc) where status = 'visible';
create index if not exists posts_repost_idx on public.posts (repost_of) where repost_of is not null;

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  --: Eine Ebene, wie bei Karten-Kommentaren.
  parent_id    uuid references public.post_comments(id) on delete cascade,
  body         text not null check (length(btrim(body)) between 2 and 500),
  status       text not null default 'visible' check (status in ('visible', 'blocked', 'hidden')),
  block_reason text,
  report_count int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at) where status = 'visible';

create table if not exists public.post_reports (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.post_comment_reports (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- Kein direkter Zugriff, wie bei comments (0036): nur ueber die Funktionen,
-- sonst liesse sich die Pruefung umgehen.
alter table public.posts                enable row level security;
alter table public.post_likes           enable row level security;
alter table public.post_comments        enable row level security;
alter table public.post_reports         enable row level security;
alter table public.post_comment_reports enable row level security;
revoke all on public.posts, public.post_likes, public.post_comments,
              public.post_reports, public.post_comment_reports from anon, authenticated;


-- --- Hilfen (nur intern) -------------------------------------------------------
create or replace function public.post_rejection(p_body text)
returns text
language sql immutable set search_path = ''
as $fn$
  -- Die Texte von comment_rejection sprechen von "Kommentaren".
  select replace(public.comment_rejection(p_body), 'in Kommentaren', 'in Beiträgen');
$fn$;

create or replace function public.post_sichtbar(p_post uuid, p_me uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1 from public.posts p
     where p.id = p_post and p.status = 'visible'
       and (
         p.user_id = p_me
         or exists (select 1 from public.follows f
                     where f.follower_id = p_me and f.followee_id = p.user_id)
         -- Repostet von jemandem, dem ich folge: dann steht er in meinem Home.
         or exists (select 1 from public.posts r
                      join public.follows f2 on f2.followee_id = r.user_id and f2.follower_id = p_me
                     where r.repost_of = p.id and r.status = 'visible')
       )
  );
$fn$;

create or replace function public.post_json(p_id uuid, p_me uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'id',   p.id,
    'art',  p.art,
    'body', p.body,
    'at',   p.created_at,
    'wer',  jsonb_build_object(
              'handle', a.handle,
              'name', coalesce(nullif(trim(a.display_name), ''), a.handle),
              'avatar_seed', a.avatar_seed, 'avatar_path', a.avatar_path,
              'ich', a.id = p_me),
    'ist_meins',  p.user_id = p_me,
    'likes',      (select count(*) from public.post_likes l where l.post_id = p.id),
    'ich_like',   exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_me),
    'kommentare', (select count(*) from public.post_comments c where c.post_id = p.id and c.status = 'visible'),
    'reposts',    (select count(*) from public.posts r where r.repost_of = p.id and r.status = 'visible'),
    'karte', case when ci.id is null then null else jsonb_build_object(
               'content_id', ci.id, 'title', ci.title, 'deck', ci.deck,
               'category', ci.primary_category_id) end,
    'original', case when o.id is null then null else jsonb_build_object(
               'id', o.id, 'art', o.art, 'body', o.body, 'at', o.created_at,
               'wer', jsonb_build_object(
                        'handle', oa.handle,
                        'name', coalesce(nullif(trim(oa.display_name), ''), oa.handle),
                        'avatar_seed', oa.avatar_seed, 'avatar_path', oa.avatar_path,
                        'ich', oa.id = p_me),
               'karte', case when oci.id is null then null else jsonb_build_object(
                          'content_id', oci.id, 'title', oci.title, 'deck', oci.deck,
                          'category', oci.primary_category_id) end) end
  )
    from public.posts p
    join public.profiles a on a.id = p.user_id
    left join public.content_items ci  on ci.id = p.content_id and ci.status = 'approved'
    left join public.posts o           on o.id = p.repost_of and o.status = 'visible'
    left join public.profiles oa       on oa.id = o.user_id
    left join public.content_items oci on oci.id = o.content_id and oci.status = 'approved'
   where p.id = p_id;
$fn$;

-- Nimmt p_me als Parameter und darf deshalb von aussen nicht aufrufbar sein:
-- sonst liesse sich jeder Beitrag als "jemand anders" lesen.
revoke execute on function public.post_sichtbar(uuid, uuid) from anon, authenticated;
revoke execute on function public.post_json(uuid, uuid) from anon, authenticated;


-- --- Schreiben -------------------------------------------------------------------
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
  v_body   text := btrim(coalesce(p_body, ''));
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


create or replace function public.set_post_like(p_post uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if not public.post_sichtbar(p_post, v_me) then raise exception 'Beitrag nicht sichtbar'; end if;
  if p_on then
    insert into public.post_likes (post_id, user_id) values (p_post, v_me) on conflict do nothing;
  else
    delete from public.post_likes where post_id = p_post and user_id = v_me;
  end if;
end
$fn$;
grant execute on function public.set_post_like(uuid, boolean) to authenticated;


create or replace function public.add_post_comment(
  p_post   uuid,
  p_body   text,
  p_parent uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
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


-- --- Lesen: ein Beitrag mit Kommentaren ------------------------------------------
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


-- --- Melden und Loeschen ------------------------------------------------------------
create or replace function public.report_post(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  insert into public.post_reports (post_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  select count(*) into v_count from public.post_reports where post_id = p_id;
  -- Drei Meldungen, und er ist weg - dieselbe Abwaegung wie in 0036.
  update public.posts
     set report_count = v_count,
         status = case when v_count >= 3 then 'hidden' else status end
   where id = p_id;
end
$fn$;
grant execute on function public.report_post(uuid) to authenticated;

create or replace function public.delete_post(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.posts where id = p_id and user_id = auth.uid();
$fn$;
grant execute on function public.delete_post(uuid) to authenticated;

create or replace function public.report_post_comment(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  insert into public.post_comment_reports (comment_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  select count(*) into v_count from public.post_comment_reports where comment_id = p_id;
  update public.post_comments
     set report_count = v_count,
         status = case when v_count >= 3 then 'hidden' else status end
   where id = p_id;
end
$fn$;
grant execute on function public.report_post_comment(uuid) to authenticated;

-- Eigene Kommentare - und Kommentare unter dem EIGENEN Beitrag: wer postet,
-- muss aufraeumen koennen, was darunter steht.
create or replace function public.delete_post_comment(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.post_comments c
   where c.id = p_id
     and (c.user_id = auth.uid()
          or exists (select 1 from public.posts p where p.id = c.post_id and p.user_id = auth.uid()));
$fn$;
grant execute on function public.delete_post_comment(uuid) to authenticated;


-- --- Home, zweite Fassung ---------------------------------------------------------------
drop function if exists public.get_home(int);

create or replace function public.get_home(p_limit int default 25, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_bis   timestamptz := coalesce(p_before, 'infinity'::timestamptz);
  -- Aktivitaeten reichen 90 Tage zurueck, Beitraege und Empfehlungen ohne
  -- Grenze: nach unten soll es weitergehen, solange es etwas gibt.
  v_seit  timestamptz := now() - interval '90 days';
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 60);
  v_erste boolean := p_before is null;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  return (
    with folge as (
      select f.followee_id as id from public.follows f where f.follower_id = v_me
    ),
    person as (
      select p.id, p.handle,
             coalesce(nullif(trim(p.display_name), ''), p.handle) as name,
             p.avatar_seed, p.avatar_path,
             p.leaderboard_opt_in as offen
        from public.profiles p
       where p.id in (select id from folge) or p.id = v_me
    ),
    eintraege as (
      -- Beitraege. `was` entsteht erst fuer die Seite (siehe unten) - post_json
      -- fuer JEDEN Beitrag zu rechnen, auch fuer die, die nicht auf die Seite
      -- kommen, waere die teuerste Zeile hier.
      select 'post'::text as art, po.created_at as at, po.user_id as wer,
             po.id as ref, null::jsonb as was
        from public.posts po
       where po.status = 'visible'
         and (po.user_id in (select id from folge) or po.user_id = v_me)
         and po.created_at < v_bis

      union all
      -- Karten-Empfehlungen, mit dem, was die Knoepfe darunter brauchen
      select 'repost', r.created_at, r.user_id, null::uuid,
             jsonb_build_object(
               'content_id', ci.id, 'title', ci.title, 'deck', ci.deck,
               'category', ci.primary_category_id, 'comment', r.comment,
               'likes', ci.like_count, 'kommentare', ci.comment_count,
               'ich_like', coalesce((select ucs.is_liked from public.user_content_state ucs
                                      where ucs.user_id = v_me and ucs.content_id = ci.id), false),
               'ich_repost', exists (select 1 from public.reposts mr
                                      where mr.user_id = v_me and mr.content_id = ci.id))
        from public.reposts r
        join public.content_items ci on ci.id = r.content_id and ci.status = 'approved'
       where (r.user_id in (select id from folge) or r.user_id = v_me)
         and r.created_at < v_bis

      union all
      -- Fragen unter Karten
      select 'frage', c.created_at, c.user_id, null::uuid,
             jsonb_build_object('content_id', ci.id, 'title', ci.title, 'body', c.body)
        from public.comments c
        join public.content_items ci on ci.id = c.content_id and ci.status = 'approved'
       where c.user_id in (select id from folge)
         and c.status = 'visible' and c.parent_id is null
         and c.created_at < v_bis and c.created_at >= v_seit

      union all
      -- Duelle: nur der Sieger, ohne Gegner
      select 'duell', s.at, s.sieger, null::uuid,
             jsonb_build_object('punkte', s.sieger_punkte, 'gegner_punkte', s.verlierer_punkte)
        from (
          select greatest(pa.finished_at, pb.finished_at) as at,
                 case when pa.correct > pb.correct then d.challenger else d.opponent end as sieger,
                 greatest(pa.correct, pb.correct) as sieger_punkte,
                 least(pa.correct, pb.correct) as verlierer_punkte
            from public.duels d
            join public.duel_plays pa on pa.duel_id = d.id and pa.user_id = d.challenger
                                     and pa.finished_at is not null
            join public.duel_plays pb on pb.duel_id = d.id and pb.user_id = d.opponent
                                     and pb.finished_at is not null
           where pa.correct <> pb.correct
        ) s
        join public.profiles sp on sp.id = s.sieger
       where s.sieger in (select id from folge)
         and sp.leaderboard_opt_in
         and s.at < v_bis and s.at >= v_seit

      union all
      -- Abgeschlossene Kurse
      select 'kurs', k.at, k.user_id, null::uuid,
             jsonb_build_object('slug', co.slug, 'title', co.title, 'lessons', g.gesamt)
        from (
          select ucs.user_id, cl.course_id, count(*) as gelesen, max(ucs.last_seen_at) as at
            from public.course_lessons cl
            join public.user_content_state ucs
              on ucs.content_id = cl.content_id and ucs.is_read_validated
           where ucs.user_id in (select id from person where offen and id <> v_me)
           group by ucs.user_id, cl.course_id
        ) k
        join public.courses co on co.id = k.course_id and co.is_published
        cross join lateral (
          select count(*) as gesamt from public.course_lessons x where x.course_id = co.id
        ) g
       where k.gelesen >= g.gesamt
         and k.at < v_bis and k.at >= v_seit

      union all
      -- Abzeichen
      select 'abzeichen', ua.unlocked_at, ua.user_id, null::uuid,
             jsonb_build_object('title', a.title, 'emoji', a.emoji)
        from public.user_achievements ua
        join public.achievements a on a.id = ua.achievement_id
       where ua.user_id in (select id from person where offen and id <> v_me)
         and not a.is_secret
         and ua.unlocked_at < v_bis and ua.unlocked_at >= v_seit

      union all
      -- Wem meine Leute neu folgen
      select 'folgt', f.created_at, f.follower_id, null::uuid,
             jsonb_build_object(
               'handle', p.handle,
               'name', coalesce(nullif(trim(p.display_name), ''), p.handle),
               'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
               'bin_ich', p.id = v_me)
        from public.follows f
        join public.profiles p on p.id = f.followee_id
       where f.follower_id in (select id from folge)
         and f.created_at < v_bis and f.created_at >= v_seit
    ),
    seite as (
      select * from eintraege order by at desc limit v_limit
    )
    select jsonb_build_object(
      'eintraege', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'art', e.art,
                 'at',  e.at,
                 'wer', jsonb_build_object(
                          'handle', p.handle, 'name', p.name,
                          'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
                          'ich', p.id = v_me),
                 'was', case when e.art = 'post' then public.post_json(e.ref, v_me) else e.was end
               ) order by e.at desc)
          from seite e
          join person p on p.id = e.wer
      ), '[]'::jsonb),

      'leute', case when not v_erste then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'handle', p.handle, 'name', p.name,
                 'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
                 'zuletzt', l.zuletzt
               ) order by l.zuletzt desc)
          from (select wer, max(at) as zuletzt from eintraege where wer <> v_me group by wer) l
          join person p on p.id = l.wer
      ), '[]'::jsonb) end,

      'folge_ich', (select count(*) from folge),

      'vorschlaege', case when not v_erste then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', v.id, 'handle', v.handle, 'name', v.name,
                 'avatar_seed', v.avatar_seed, 'avatar_path', v.avatar_path,
                 'follower_count', v.follower_count, 'grund', v.grund
               ) order by v.rang, v.follower_count desc)
          from (
            select s.*
              from (
                select p.id, p.handle,
                       coalesce(nullif(trim(p.display_name), ''), p.handle) as name,
                       p.avatar_seed, p.avatar_path, p.follower_count,
                       case
                         when exists (select 1 from public.follows f
                                       where f.follower_id = p.id and f.followee_id = v_me)
                           then 'folgt dir'
                         when exists (select 1 from public.follows f
                                       where f.followee_id = p.id
                                         and f.follower_id in (select id from folge))
                           then 'deine Leute folgen'
                         else null
                       end as grund,
                       case
                         when exists (select 1 from public.follows f
                                       where f.follower_id = p.id and f.followee_id = v_me) then 0
                         when exists (select 1 from public.follows f
                                       where f.followee_id = p.id
                                         and f.follower_id in (select id from folge)) then 1
                         else 2
                       end as rang
                  from public.profiles p
                 where p.id <> v_me
                   and p.id not in (select id from folge)
                   and p.onboarding_completed_at is not null
              ) s
             where s.rang < 2 or s.follower_count > 0
             order by s.rang, s.follower_count desc
             limit 12
          ) v
      ), '[]'::jsonb) end
    )
  );
end
$fn$;

revoke execute on function public.get_home(int, timestamptz) from anon;
grant  execute on function public.get_home(int, timestamptz) to authenticated;

notify pgrst, 'reload schema';
