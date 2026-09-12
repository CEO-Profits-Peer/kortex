-- =============================================================================
-- 0065_profile_lists.sql  ·  Das Profil zeigt einen Auszug, nicht alles
--
-- Zwei Dinge, und das zweite ist ein Fehler von mir.
--
-- 1. Das Profil schickte bisher JEDEN Repost und JEDEN Like mit. Bei ein
--    paar Dutzend faellt das nicht auf, bei ein paar hundert scrollt man
--    minutenlang an der eigenen Vergangenheit vorbei, bevor der Lernstand
--    kommt. Kuenftig: zwoelf je Liste im Profil, der Rest hinter "Alle
--    ansehen" (get_my_collection).
--
-- 2. Das `limit 24` in get_my_social hat nie etwas begrenzt. Es stand HINTER
--    dem jsonb_agg - und ein Aggregat liefert genau eine Zeile. Die Anfrage
--    hat also brav "hoechstens 24 Zeilen" geliefert, naemlich die eine, in
--    der alle Eintraege drin waren. Das ist kein Tippfehler, den man beim
--    Lesen sieht: die Abfrage ist gueltig, sie tut nur nichts. Aufgefallen
--    ist es erst an der Beschwerde "das hoert nicht auf".
--
--    Deshalb steht das Limit jetzt in einer Unterabfrage, wo es die Zeilen
--    trifft, aus denen aggregiert wird.
--
-- Vollstaendig aus der Fassung von 0018_like_counts.sql neu geschrieben,
-- nicht aus einem Ausschnitt geflickt.
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
      select coalesce(jsonb_agg(z order by at desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'content_id', r.content_id,
                 'title',      ci.title,
                 'category',   ci.primary_category_id,
                 'comment',    r.comment,
                 'likes',      ci.like_count,
                 'at',         r.created_at
               ) as z,
               r.created_at as at
          from public.reposts r
          join public.content_items ci on ci.id = r.content_id
         where r.user_id = p.id
         order by r.created_at desc
         limit 12
      ) q
    ),
    'likes', (
      select coalesce(jsonb_agg(z order by at desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'content_id', u.content_id,
                 'title',      ci.title,
                 'category',   ci.primary_category_id,
                 'likes',      ci.like_count,
                 'at',         u.last_seen_at
               ) as z,
               u.last_seen_at as at
          from public.user_content_state u
          join public.content_items ci on ci.id = u.content_id
         where u.user_id = p.id and u.is_liked
         order by u.last_seen_at desc
         limit 12
      ) q
    )
  )
  from public.profiles p where p.id = auth.uid();
$fn$;
grant execute on function public.get_my_social() to authenticated;


-- =============================================================================
-- Die vollstaendige Liste, seitenweise
--
-- Eine Funktion fuer beide Listen statt zwei fast gleicher: die Form der
-- Antwort ist dieselbe, und zwei Funktionen waeren zwei Stellen, an denen
-- man das naechste Feld vergisst.
--
-- Kein Cursor, sondern offset. Bei einer Liste, die man von oben nach unten
-- durchblaettert und die sich waehrenddessen kaum aendert, ist das
-- ehrlicher als ein Keyset ueber einen Zeitstempel, der bei Likes aus
-- last_seen_at kommt - und der bewegt sich, sobald man die Karte wiedersieht.
-- =============================================================================
create or replace function public.get_my_collection(
  p_kind   text,
  p_limit  int default 40,
  p_offset int default 0
) returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select case when p_kind = 'likes' then (
    select coalesce(jsonb_agg(z order by at desc), '[]'::jsonb) from (
      select jsonb_build_object(
               'content_id', u.content_id,
               'title',      ci.title,
               'category',   ci.primary_category_id,
               'comment',    null::text,
               'likes',      ci.like_count,
               'at',         u.last_seen_at
             ) as z,
             u.last_seen_at as at
        from public.user_content_state u
        join public.content_items ci on ci.id = u.content_id
       where u.user_id = auth.uid() and u.is_liked
       order by u.last_seen_at desc
       limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
    ) q
  ) else (
    select coalesce(jsonb_agg(z order by at desc), '[]'::jsonb) from (
      select jsonb_build_object(
               'content_id', r.content_id,
               'title',      ci.title,
               'category',   ci.primary_category_id,
               'comment',    r.comment,
               'likes',      ci.like_count,
               'at',         r.created_at
             ) as z,
             r.created_at as at
        from public.reposts r
        join public.content_items ci on ci.id = r.content_id
       where r.user_id = auth.uid()
       order by r.created_at desc
       limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
    ) q
  ) end;
$fn$;
grant execute on function public.get_my_collection(text, int, int) to authenticated;
