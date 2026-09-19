-- =============================================================================
-- 0098_profil_themes.sql  ·  PRO: Profil-Themes fuer die Kopfkarte
--
-- Vier Themes fuer den Kopf des eigenen Profils (bordeaux, nacht, smaragd,
-- gold) - sichtbar fuer alle, die das Profil ansehen. Setzen nur ueber
-- profil_theme_setzen() mit PRO; zuruecksetzen (null) geht immer. Laeuft PRO
-- ab, bleibt das Theme stehen - wie Profilbild und angepinnte Beitraege
-- (0091: Wegnehmen fuehlt sich an wie eine Strafe).
--
-- get_public_profile vollstaendig aus 0095, plus profil_theme.
-- =============================================================================

alter table public.profiles add column if not exists profil_theme text
  check (profil_theme is null or profil_theme in ('bordeaux', 'nacht', 'smaragd', 'gold'));

create or replace function public.profil_theme_setzen(p_theme text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if p_theme is not null and not public.ist_pro(v_me) then
    raise exception 'PRO:Profil-Themes gibt es mit PRO.';
  end if;
  if p_theme is not null and p_theme not in ('bordeaux', 'nacht', 'smaragd', 'gold') then
    raise exception 'Dieses Theme gibt es nicht';
  end if;
  update public.profiles set profil_theme = p_theme where id = v_me;
end
$fn$;
revoke execute on function public.profil_theme_setzen(text) from anon;
grant execute on function public.profil_theme_setzen(text) to authenticated;

-- --- get_public_profile (vollstaendig aus 0095) ----------------------------------------
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
    -- 0091: das Abzeichen. Nur ja/nein, kein Ablaufdatum.
    'pro',             public.ist_pro(p.id),
    -- 0095: Meisterwege - gewaehlter Rahmen, Namensfarbe und die Stufen je
    -- Thema (nur die Stufe, keine Mastery-Zahl: die bleibt wie mastery_total
    -- hinter leaderboard_opt_in).
    'rahmen',          p.rahmen,
    -- 0098: Profil-Theme (PRO) - nur der Name, die App kennt das Aussehen.
    'profil_theme',    p.profil_theme,
    'namensfarbe',     p.namensfarbe,
    'meister', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'emoji', c.emoji, 'stufe', public.meister_stufe(m.mastery))
                      order by public.meister_stufe(m.mastery) desc, c.sort_order), '[]'::jsonb)
        from public.meister_mastery(p.id) m
        join public.categories c on c.id = m.wurzel and c.parent_id is null and c.is_active
       where public.meister_stufe(m.mastery) >= 1
    ),
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

-- --- Selbsttest (rollt alles zurueck) ------------------------------------------------
do $test$
declare
  v_id  uuid;
  v_hdl text;
begin
  select id, handle into v_id, v_hdl from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0098: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    update public.profiles set plan = 'free', plan_expires_at = null where id = v_id;
    begin
      perform public.profil_theme_setzen('gold');
      raise exception 'Selbsttest 0098: Theme ohne PRO angenommen';
    exception when others then
      if sqlerrm not like 'PRO:%' then raise; end if;
    end;
    update public.profiles set plan = 'gifted', plan_expires_at = now() + interval '1 day' where id = v_id;
    perform public.profil_theme_setzen('gold');
    if public.get_public_profile(v_hdl)->>'profil_theme' <> 'gold' then
      raise exception 'Selbsttest 0098: Theme nicht im Profil';
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0098: ok';
end
$test$;

notify pgrst, 'reload schema';
