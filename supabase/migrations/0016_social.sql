-- =============================================================================
-- 0016_social.sql  ·  Folgen, Reposts, sichtbare Likes
--
-- Der Datenunterbau für: Personen folgen, sehen was andere geliked haben,
-- selbst reposten.
--
-- EINE ENTSCHEIDUNG VORWEG, die im Schema steht und nicht in einem Menü:
--
-- Likes sind standardmäßig PRIVAT. `profiles.likes_public` startet auf false.
--
-- Sobald sichtbar wird, was jemand liked, entsteht öffentliches Verhalten -
-- und ein erheblicher Teil der Zielgruppe ist minderjährig. Ein Vierzehn-
-- jähriger, der eine Karte über Depression liked, hat damit keine
-- Veröffentlichung beabsichtigt.
--
-- Wer teilen will, schaltet es ein. Das kostet Reichweite und ist der
-- richtige Preis.
-- =============================================================================

alter table public.profiles
  add column if not exists likes_public boolean not null default false,
  add column if not exists bio text check (bio is null or length(bio) <= 160),
  -- Profilbild: Verweis in den Storage-Bucket 'avatars'. Bleibt NULL, dann
  -- zeichnet die App weiter das erzeugte Muster aus avatar_seed.
  add column if not exists avatar_path text,
  add column if not exists follower_count int not null default 0,
  add column if not exists following_count int not null default 0;


-- =============================================================================
-- Folgen
--
-- Bewusst asymmetrisch (wie bei einem Feed, nicht wie bei einer Freundesliste):
-- Folgen braucht keine Bestätigung. Die bestehende friendships-Tabelle bleibt
-- für gegenseitige Freundschaften und Quiz-Duelle.
-- =============================================================================

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id, created_at desc);

alter table public.follows enable row level security;

-- Wer wem folgt, ist für Eingeloggte sichtbar - das ist der Sinn von Folgen.
create policy "follows readable" on public.follows
  for select to authenticated using (true);
create policy "follow yourself out of it" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "unfollow own" on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

grant select, insert, delete on public.follows to authenticated;


-- Zähler mitführen, damit Profile ohne count(*) auskommen.
create or replace function public.tg_follow_counts()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count  = follower_count  + 1 where id = new.followee_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set follower_count  = greatest(0, follower_count  - 1) where id = old.followee_id;
  end if;
  return null;
end
$fn$;

drop trigger if exists follows_count on public.follows;
create trigger follows_count
  after insert or delete on public.follows
  for each row execute function public.tg_follow_counts();


-- =============================================================================
-- Reposts
--
-- Ein Repost ist eine Empfehlung mit Namen dran, kein Kopieren: gespeichert
-- wird ein Verweis auf die Karte plus optional ein eigener Satz. Der
-- ursprüngliche Inhalt und seine Quellen bleiben unverändert - sonst wäre
-- die ganze Lizenz-Kette aus docs/CONTENT-SOURCING.md hinfällig.
-- =============================================================================

create table if not exists public.reposts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  comment    text check (comment is null or length(comment) <= 240),
  created_at timestamptz not null default now(),
  unique (user_id, content_id)
);
create index if not exists reposts_user_idx on public.reposts (user_id, created_at desc);
create index if not exists reposts_content_idx on public.reposts (content_id);

alter table public.reposts enable row level security;

create policy "reposts readable" on public.reposts
  for select to authenticated using (true);
create policy "own reposts write" on public.reposts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own reposts delete" on public.reposts
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.reposts to authenticated;


-- =============================================================================
-- Funktionen
-- =============================================================================

create or replace function public.set_following(p_user uuid, p_follow boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_user then raise exception 'cannot follow yourself'; end if;

  if p_follow then
    insert into public.follows (follower_id, followee_id)
    values (v_me, p_user) on conflict do nothing;
  else
    delete from public.follows where follower_id = v_me and followee_id = p_user;
  end if;
end
$fn$;
grant execute on function public.set_following(uuid, boolean) to authenticated;


create or replace function public.set_repost(
  p_content_id uuid,
  p_on         boolean,
  p_comment    text default null
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  if p_on then
    -- Nur reposten, was man gelesen hat. Sonst wird die Funktion zum
    -- Verteilkanal fuer Inhalte, die niemand geprueft hat.
    if not exists (
      select 1 from public.user_content_state
       where user_id = v_me and content_id = p_content_id and is_read_validated
    ) then
      raise exception 'card not read yet';
    end if;

    insert into public.reposts (user_id, content_id, comment)
    values (v_me, p_content_id, nullif(trim(coalesce(p_comment, '')), ''))
    on conflict (user_id, content_id) do update set comment = excluded.comment;
  else
    delete from public.reposts where user_id = v_me and content_id = p_content_id;
  end if;
end
$fn$;
grant execute on function public.set_repost(uuid, boolean, text) to authenticated;


-- =============================================================================
-- Öffentliches Profil einer anderen Person
--
-- Zeigt Likes nur, wenn die Person das eingeschaltet hat. Reposts sind immer
-- sichtbar - ein Repost ist eine bewusste Veröffentlichung, ein Like nicht.
-- =============================================================================

create or replace function public.get_public_profile(p_handle text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_them uuid;
  v_out  jsonb;
begin
  select id into v_them from public.profiles where handle = p_handle;
  if v_them is null then raise exception 'unknown handle: %', p_handle; end if;

  select jsonb_build_object(
    'id',              p.id,
    'handle',          p.handle,
    'display_name',    p.display_name,
    'bio',             p.bio,
    'avatar_seed',     p.avatar_seed,
    'avatar_path',     p.avatar_path,
    'region_code',     case when p.leaderboard_opt_in then p.region_code else null end,
    'mastery_total',   case when p.leaderboard_opt_in then p.mastery_total else null end,
    'streak_current',  case when p.leaderboard_opt_in then p.streak_current else null end,
    'follower_count',  p.follower_count,
    'following_count', p.following_count,
    'is_me',           p.id = v_me,
    'i_follow',        exists (
                         select 1 from public.follows f
                          where f.follower_id = v_me and f.followee_id = p.id),
    'likes_public',    p.likes_public,
    'reposts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'content_id', r.content_id,
               'title',      ci.title,
               'category',   ci.primary_category_id,
               'comment',    r.comment,
               'at',         r.created_at
             ) order by r.created_at desc), '[]'::jsonb)
        from public.reposts r
        join public.content_items ci on ci.id = r.content_id
       where r.user_id = p.id and ci.status = 'approved'
       limit 30
    ),
    'likes', (
      select case when not p.likes_public then null else coalesce(jsonb_agg(jsonb_build_object(
               'content_id', ucs.content_id,
               'title',      ci.title,
               'category',   ci.primary_category_id,
               'at',         ucs.last_seen_at
             ) order by ucs.last_seen_at desc), '[]'::jsonb) end
        from public.user_content_state ucs
        join public.content_items ci on ci.id = ucs.content_id
       where ucs.user_id = p.id and ucs.is_liked and ci.status = 'approved'
       limit 30
    )
  ) into v_out
  from public.profiles p where p.id = v_them;

  return v_out;
end
$fn$;
grant execute on function public.get_public_profile(text) to authenticated;


-- =============================================================================
-- Freundes-Feed: was die Leute, denen ich folge, empfohlen haben
-- =============================================================================

create or replace function public.get_following_feed(p_limit int default 30)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(row order by row->>'at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'kind',        'repost',
      'content_id',  r.content_id,
      'title',       ci.title,
      'deck',        ci.deck,
      'category',    ci.primary_category_id,
      'handle',      p.handle,
      'avatar_seed', p.avatar_seed,
      'avatar_path', p.avatar_path,
      'comment',     r.comment,
      'at',          r.created_at
    ) as row
      from public.reposts r
      join public.profiles p       on p.id = r.user_id
      join public.content_items ci on ci.id = r.content_id
     where ci.status = 'approved'
       and r.user_id in (
         select followee_id from public.follows where follower_id = auth.uid()
       )
     order by r.created_at desc
     limit p_limit
  ) t;
$fn$;
grant execute on function public.get_following_feed(int) to authenticated;


-- =============================================================================
-- Personen suchen: search_all kennt Profile schon, aber ohne Folge-Status
-- =============================================================================

create or replace function public.search_people(p_query text, p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            p.id,
    'handle',        p.handle,
    'display_name',  p.display_name,
    'avatar_seed',   p.avatar_seed,
    'avatar_path',   p.avatar_path,
    'follower_count',p.follower_count,
    'i_follow',      exists (select 1 from public.follows f
                              where f.follower_id = auth.uid() and f.followee_id = p.id),
    'is_me',         p.id = auth.uid()
  )), '[]'::jsonb)
  from public.profiles p
  where p.handle ilike '%' || lower(regexp_replace(trim(p_query), '^@', '')) || '%'
  limit p_limit;
$fn$;
grant execute on function public.search_people(text, int) to authenticated;


-- Einstellungen erweitern: Likes sichtbar machen, Bio, Profilbild
create or replace function public.update_my_settings(p_patch jsonb)
returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_out  public.profiles;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  update public.profiles set
    display_name       = coalesce(p_patch->>'display_name', display_name),
    bio                = case when p_patch ? 'bio' then nullif(trim(p_patch->>'bio'), '') else bio end,
    avatar_path        = case when p_patch ? 'avatar_path' then nullif(p_patch->>'avatar_path', '') else avatar_path end,
    language           = coalesce(nullif(p_patch->>'language', ''), language),
    country_code       = coalesce(nullif(p_patch->>'country_code', ''), country_code),
    region_code        = case when p_patch ? 'region_code'
                              then nullif(p_patch->>'region_code', '') else region_code end,
    timezone           = coalesce(nullif(p_patch->>'timezone', ''), timezone),
    leaderboard_opt_in = coalesce((p_patch->>'leaderboard_opt_in')::boolean, leaderboard_opt_in),
    likes_public       = coalesce((p_patch->>'likes_public')::boolean, likes_public),
    daily_goal_cards   = coalesce((p_patch->>'daily_goal_cards')::smallint, daily_goal_cards),
    notify_reviews     = coalesce((p_patch->>'notify_reviews')::boolean, notify_reviews),
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;
grant execute on function public.update_my_settings(jsonb) to authenticated;
