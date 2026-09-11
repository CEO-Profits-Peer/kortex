-- =============================================================================
-- 0018_like_counts.sql
--
-- Zwei Änderungen an der Like-Logik, beide auf deinen Wunsch:
--
-- 1. Likes sind jetzt standardmäßig SICHTBAR. Wer nicht möchte, dass Freunde
--    sehen was er liked, schaltet es in den Einstellungen ab.
--
--    Dein Argument dafür trägt: In dieser App gibt es keine Inhalte, die
--    jemanden bloßstellen — eine Karte über Depression IST Hilfe, kein
--    Geständnis. Das ist ein anderer Ausgangspunkt als bei einem allgemeinen
--    Feed, und damit ist die vorsichtige Grundeinstellung nicht nötig.
--
--    Die Abschaltung bleibt trotzdem, und sie wirkt nur auf die namentliche
--    Zuordnung.
--
-- 2. Der Zähler zählt IMMER mit — auch bei abgeschalteter Sichtbarkeit.
--    Genau das war dein Punkt: „es kommt zum allgemeinen Like counter".
--    Anonymes Zählen ist etwas anderes als namentliches Zeigen.
-- =============================================================================

alter table public.profiles
  alter column likes_public set default true;

-- Bestehende Konten, die die Einstellung nie angefasst haben, mitziehen.
update public.profiles set likes_public = true where likes_public = false;


-- --- Zähler auf der Karte ---------------------------------------------------

alter table public.content_items
  add column if not exists like_count int not null default 0;

create index if not exists content_items_popular_idx
  on public.content_items (like_count desc)
  where status = 'approved';


/**
 * Zähler mitführen.
 *
 * Aus user_content_state, nicht aus einem Ereignisstrom: dort steht der
 * ZUSTAND (is_liked), nicht die Historie. Damit kann zehnmaliges Tippen den
 * Zähler nicht hochtreiben.
 */
create or replace function public.tg_like_count()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and old.is_liked is distinct from new.is_liked then
    update public.content_items
       set like_count = greatest(0, like_count + (case when new.is_liked then 1 else -1 end))
     where id = new.content_id;
  elsif tg_op = 'INSERT' and new.is_liked then
    update public.content_items set like_count = like_count + 1 where id = new.content_id;
  elsif tg_op = 'DELETE' and old.is_liked then
    update public.content_items
       set like_count = greatest(0, like_count - 1) where id = old.content_id;
  end if;
  return null;
end
$fn$;

drop trigger if exists content_like_count on public.user_content_state;
create trigger content_like_count
  after insert or update or delete on public.user_content_state
  for each row execute function public.tg_like_count();


-- Einmalig auf den Ist-Stand bringen.
update public.content_items ci
   set like_count = coalesce(c.n, 0)
  from (
    select content_id, count(*) as n
      from public.user_content_state where is_liked group by content_id
  ) c
 where c.content_id = ci.id;


-- =============================================================================
-- Eigenes Profil: Zahlen für die Profilseite
--
-- get_my_stats liefert Lernzahlen. Für den Profilkopf braucht es die
-- sozialen: Follower, Gefolgte, eigene Empfehlungen, vergebene Likes.
-- =============================================================================

create or replace function public.get_my_social()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'handle',          p.handle,
    'display_name',    p.display_name,
    'bio',             p.bio,
    'avatar_seed',     p.avatar_seed,
    'avatar_path',     p.avatar_path,
    'follower_count',  p.follower_count,
    'following_count', p.following_count,
    'likes_public',    p.likes_public,
    'repost_count',    (select count(*) from public.reposts r where r.user_id = p.id),
    'like_count',      (select count(*) from public.user_content_state u
                         where u.user_id = p.id and u.is_liked),
    'reposts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'content_id', r.content_id,
               'title',      ci.title,
               'category',   ci.primary_category_id,
               'comment',    r.comment,
               'likes',      ci.like_count,
               'at',         r.created_at
             ) order by r.created_at desc), '[]'::jsonb)
        from public.reposts r
        join public.content_items ci on ci.id = r.content_id
       where r.user_id = p.id
       limit 24
    ),
    'likes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'content_id', u.content_id,
               'title',      ci.title,
               'category',   ci.primary_category_id,
               'likes',      ci.like_count,
               'at',         u.last_seen_at
             ) order by u.last_seen_at desc), '[]'::jsonb)
        from public.user_content_state u
        join public.content_items ci on ci.id = u.content_id
       where u.user_id = p.id and u.is_liked
       limit 24
    )
  )
  from public.profiles p where p.id = auth.uid();
$fn$;
grant execute on function public.get_my_social() to authenticated;
