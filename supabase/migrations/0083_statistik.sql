-- =============================================================================
-- 0083_statistik.sql  ·  Zahlen fuers eigene Profil und fuer fremde
--
-- Zwei Wuensche:
--
--   "Profildetailsstats von anderen ansehen: Gesamte Likes bekommen, dabei
--    seit, etc."
--      -> get_public_profile bekommt dabei_seit, beitraege, likes_bekommen.
--
--   "Button im Profil, auf dem man viele seiner Statistiken sieht: Follower-
--    Graph, gesamte Likes, gesehene Reels, wie viele Follower man durch einen
--    Post bekommen hat"
--      -> get_my_statistik, nur fuer sich selbst.
--
-- Was davon ab wann stimmt
-- ------------------------
-- Follower-Verlauf und Follower je Beitrag kommen aus follow_events (0080).
-- Vor dem 13.09.2026 gibt es dort nur die heutigen Follower, nachgetragen mit
-- ihrem echten Zeitpunkt - wer vorher gefolgt und wieder gegangen ist, fehlt.
-- Die Funktion liefert das Datum mit (`mitschrift_seit`), und die App sagt es
-- dazu, statt einen glatten Graphen vorzutaeuschen.
--
-- "Gelesen je Tag" kommt aus xp_ledger (kind 'read'): user_content_state kennt
-- nur den LETZTEN Besuch einer Karte, nicht jeden Tag, an dem gelesen wurde.
-- =============================================================================


-- --- Oeffentliches Profil (vollstaendig aus 0016, drei Felder mehr) -----------------
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
    -- 0083: Nur Zahlen, kein Inhalt. Wie viele Beitraege es gibt, sieht man
    -- ohnehin schon (get_user_posts, 0078); Likes und "dabei seit" sagen
    -- nichts, was jemand verbergen muesste.
    'dabei_seit',      p.created_at,
    'beitraege',       (select count(*) from public.posts po
                         where po.user_id = p.id and po.status = 'visible'),
    'likes_bekommen',  (select count(*) from public.post_likes l
                          join public.posts po on po.id = l.post_id
                         where po.user_id = p.id and po.status = 'visible' and l.user_id <> p.id)
                     + (select count(*) from public.post_comment_likes l
                          join public.post_comments c on c.id = l.comment_id
                         where c.user_id = p.id and c.status = 'visible' and l.user_id <> p.id),
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


-- --- Eigene Statistik ------------------------------------------------------------------
create or replace function public.get_my_statistik()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_p  public.profiles;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_me;

  return jsonb_build_object(
    'dabei_seit',      v_p.created_at,
    -- Seit wann follow_events mitschreibt (0080). Davor: siehe Kopf.
    'mitschrift_seit', '2026-09-13'::date,

    'sozial', jsonb_build_object(
      'follower',   v_p.follower_count,
      'folgt',      v_p.following_count,
      'beitraege',  (select count(*) from public.posts where user_id = v_me and status = 'visible'),
      'likes',      (select count(*) from public.post_likes l
                       join public.posts po on po.id = l.post_id
                      where po.user_id = v_me and po.status = 'visible' and l.user_id <> v_me),
      'kommentar_likes', (select count(*) from public.post_comment_likes l
                            join public.post_comments c on c.id = l.comment_id
                           where c.user_id = v_me and c.status = 'visible' and l.user_id <> v_me),
      'kommentare', (select count(*) from public.post_comments c
                       join public.posts po on po.id = c.post_id
                      where po.user_id = v_me and c.user_id <> v_me and c.status = 'visible'),
      'geteilt',    (select count(*) from public.posts r
                       join public.posts o on o.id = r.repost_of
                      where o.user_id = v_me and r.user_id <> v_me and r.status = 'visible'),
      'empfohlen',  (select count(*) from public.reposts where user_id = v_me)
    ),

    'lernen', jsonb_build_object(
      'gesehen',       (select count(*) from public.user_content_state where user_id = v_me),
      'gelesen',       (select count(*) from public.user_content_state where user_id = v_me and is_read_validated),
      'gelikt',        (select count(*) from public.user_content_state where user_id = v_me and is_liked),
      'quiz_versuche', (select coalesce(sum(quiz_attempts), 0) from public.user_content_state where user_id = v_me),
      'quiz_richtig',  (select coalesce(sum(quiz_correct), 0) from public.user_content_state where user_id = v_me),
      'xp',            v_p.xp_total,
      'streak',        v_p.streak_current,
      'streak_best',   v_p.streak_best,
      'fokus_minuten', round(coalesce(v_p.focus_seconds_total, 0) / 60.0)
    ),

    -- 90 Tage, je Tag: Follower am Tagesende, dazugekommen, gegangen.
    'follower_verlauf', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tag', d.tag::date,
               'follower', (select count(*) filter (where e.art = 'folgt')
                                 - count(*) filter (where e.art = 'entfolgt')
                              from public.follow_events e
                             where e.followee_id = v_me and e.created_at < d.tag + interval '1 day'),
               'neu',  (select count(*) from public.follow_events e
                         where e.followee_id = v_me and e.art = 'folgt'
                           and e.created_at >= d.tag and e.created_at < d.tag + interval '1 day'),
               'weg',  (select count(*) from public.follow_events e
                         where e.followee_id = v_me and e.art = 'entfolgt'
                           and e.created_at >= d.tag and e.created_at < d.tag + interval '1 day')
             ) order by d.tag), '[]'::jsonb)
        from generate_series(date_trunc('day', now()) - interval '89 days',
                             date_trunc('day', now()), interval '1 day') as d(tag)
    ),

    -- 30 Tage gelesene Karten.
    'gelesen_verlauf', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tag', d.tag::date,
               'anzahl', (select count(*) from public.xp_ledger l
                           where l.user_id = v_me and l.kind = 'read'
                             and l.created_at >= d.tag and l.created_at < d.tag + interval '1 day')
             ) order by d.tag), '[]'::jsonb)
        from generate_series(date_trunc('day', now()) - interval '29 days',
                             date_trunc('day', now()), interval '1 day') as d(tag)
    ),

    -- Woher neue Follower kamen - nur Mitgeschriebenes, keine Nachtraege.
    'quellen', (
      select coalesce(jsonb_object_agg(q.quelle, q.anzahl), '{}'::jsonb)
        from (select coalesce(e.quelle, 'unbekannt') as quelle, count(*) as anzahl
                from public.follow_events e
               where e.followee_id = v_me and e.art = 'folgt' and not e.nachgetragen
               group by 1) q
    ),

    -- Die fuenf Beitraege mit den meisten Likes, samt Followern, die sie brachten.
    'top_beitraege', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.likes desc, t.at desc), '[]'::jsonb)
        from (
          select po.id, left(po.body, 140) as body, po.created_at as at,
                 (select count(*) from public.post_likes l where l.post_id = po.id) as likes,
                 (select count(*) from public.post_comments c
                   where c.post_id = po.id and c.status = 'visible') as kommentare,
                 (select count(*) from public.posts r
                   where r.repost_of = po.id and r.status = 'visible') as geteilt,
                 (select count(*) from public.follow_events e
                   where e.post_id = po.id and e.art = 'folgt') as neue_follower
            from public.posts po
           where po.user_id = v_me and po.status = 'visible'
           order by (select count(*) from public.post_likes l where l.post_id = po.id) desc,
                    po.created_at desc
           limit 5
        ) t
    )
  );
end
$fn$;
revoke execute on function public.get_my_statistik() from anon;
grant execute on function public.get_my_statistik() to authenticated;

notify pgrst, 'reload schema';
