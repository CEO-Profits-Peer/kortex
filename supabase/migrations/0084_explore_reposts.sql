-- =============================================================================
-- 0084_explore_reposts.sql  ·  Home in zwei Haelften, Reposts steuerbar
--
-- Gewuenscht:
--   * In Home: Following & Explore. Following = die Leute, denen du folgst.
--     Explore = Beitraege anderer, "mit vielen Likes in general, und hin und
--     wieder kleinere, um kleinen eine Chance zu geben". Keine Reposts.
--   * Einstellung: meine Reposts nur im Profil, nicht im Home anderer.
--   * Einstellung: keine Reposts in meinem Home.
--
-- Die Frage, die dahinter steckt: wer sieht einen Beitrag?
-- ---------------------------------------------------------
-- Bisher nur Follower (post_sichtbar, 0077). Explore zeigt aber genau die
-- Beitraege von Leuten, denen man NICHT folgt. Das laesst sich nicht nebenbei
-- aendern - wer bisher gepostet hat, ging davon aus, fuer seine Follower zu
-- schreiben. Deshalb ein eigener Schalter, `beitraege_oeffentlich`:
--
--   an  (Standard)  Beitraege koennen in Explore auftauchen und sind fuer
--                   alle Angemeldeten sichtbar, wie ein oeffentliches Konto
--   aus             wie bisher: nur Follower
--
-- Der Standard ist "an", weil Explore sonst leer bliebe. Bei 29 Konten ist
-- das vertretbar; die App sagt es in den Einstellungen dazu.
--
-- Was "Repost" hier heisst
-- ------------------------
-- Zwei Dinge, die in Home beide als "geteilt" erscheinen: eine Karten-
-- Empfehlung (reposts, 0016) und ein weitergeteilter Beitrag (posts mit
-- repost_of, 0077). Beide Schalter gelten fuer beides. Ein Beitrag, der eine
-- Karte mit eigenem Satz empfiehlt, ist ein Beitrag, kein Repost.
--
-- Wie Explore sortiert
-- --------------------
-- Punkte = (Likes + 2 x Kommentare + 1), geteilt durch das Alter in Tagen
-- (hoch 0.9). Kommentare zaehlen doppelt, weil ein Kommentar mehr Muehe ist
-- als ein Tipp. Das Alter bremst, damit ein Beitrag mit 40 Likes vom Maerz
-- nicht fuer immer oben steht.
--
-- Jeder vierte Platz geht an einen kleinen Account (unter 20 Followern, der
-- Beitrag unter 5 Likes), zufaellig gezogen. Ohne das sieht Explore nur, wer
-- ohnehin schon gesehen wird - und wer neu ist, bekommt nie den ersten Like.
-- =============================================================================


-- --- Einstellungen -----------------------------------------------------------------
alter table public.profiles
  add column if not exists beitraege_oeffentlich boolean not null default true,
  add column if not exists reposts_nur_profil   boolean not null default false,
  add column if not exists home_ohne_reposts    boolean not null default false;


-- Vollstaendig aus 0052, drei Zeilen mehr.
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
    avatar_seed        = case
                           when p_patch->>'avatar_seed' ~ '^v1-[0-7][0-2][01]-[0-9a-f]{2}$'
                             then p_patch->>'avatar_seed'
                           else avatar_seed
                         end,
    language           = coalesce(nullif(p_patch->>'language', ''), language),
    feed_english_pct   = coalesce(
                           least(100, greatest(0, (p_patch->>'feed_english_pct')::smallint)),
                           feed_english_pct),
    country_code       = coalesce(nullif(p_patch->>'country_code', ''), country_code),
    region_code        = case when p_patch ? 'region_code'
                              then nullif(p_patch->>'region_code', '') else region_code end,
    timezone           = coalesce(nullif(p_patch->>'timezone', ''), timezone),
    leaderboard_opt_in = coalesce((p_patch->>'leaderboard_opt_in')::boolean, leaderboard_opt_in),
    likes_public       = coalesce((p_patch->>'likes_public')::boolean, likes_public),
    daily_goal_cards   = coalesce((p_patch->>'daily_goal_cards')::smallint, daily_goal_cards),
    notify_reviews     = coalesce((p_patch->>'notify_reviews')::boolean, notify_reviews),
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak),
    notify_social      = coalesce((p_patch->>'notify_social')::boolean, notify_social),
    beitraege_oeffentlich = coalesce((p_patch->>'beitraege_oeffentlich')::boolean, beitraege_oeffentlich),
    reposts_nur_profil    = coalesce((p_patch->>'reposts_nur_profil')::boolean, reposts_nur_profil),
    home_ohne_reposts     = coalesce((p_patch->>'home_ohne_reposts')::boolean, home_ohne_reposts)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;
grant execute on function public.update_my_settings(jsonb) to authenticated;


-- --- Sichtbarkeit (vollstaendig aus 0077, eine Bedingung mehr) -------------------------
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
         -- 0084: oeffentliches Konto - der Beitrag kann aus Explore kommen.
         or (p_me is not null and exists (select 1 from public.profiles a
                                           where a.id = p.user_id and a.beitraege_oeffentlich))
       )
  );
$fn$;
revoke execute on function public.post_sichtbar(uuid, uuid) from anon, authenticated;


-- --- Beitraege im Profil (vollstaendig aus 0078, Sperre beachtet Oeffentlichkeit) -------
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
  v_offen  boolean;
  v_anzahl int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select id, beitraege_oeffentlich into v_user, v_offen from public.profiles where handle = p_handle;
  if not found then raise exception 'Profil nicht gefunden'; end if;

  select count(*) into v_anzahl from public.posts where user_id = v_user and status = 'visible';

  if v_user <> v_me and not v_offen and not exists (
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


-- --- Home: Following (vollstaendig aus 0077, Reposts filterbar) ---------------------------
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
  -- 0084: will ich ueberhaupt Reposts sehen?
  v_ohne  boolean := coalesce((select home_ohne_reposts from public.profiles where id = v_me), false);
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
             p.leaderboard_opt_in as offen,
             -- 0084: diese Person zeigt ihre Reposts nur im Profil.
             (p.reposts_nur_profil and p.id <> v_me) as reposts_privat
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
        join person pp on pp.id = po.user_id
       where po.status = 'visible'
         and po.created_at < v_bis
         -- 0084: ein reiner Repost (ohne eigenen Text) faellt unter die Schalter.
         -- Mit eigenem Text ist er ein Beitrag, der etwas zitiert.
         and not (po.repost_of is not null and length(po.body) = 0
                  and (v_ohne or pp.reposts_privat))

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
        join person rp on rp.id = r.user_id
        join public.content_items ci on ci.id = r.content_id and ci.status = 'approved'
       where r.created_at < v_bis
         and not v_ohne
         and not rp.reposts_privat

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


-- --- Explore ---------------------------------------------------------------------------------
-- Seitenweise ueber p_ausser (schon gezeigte IDs), nicht ueber einen Zeitstempel:
-- die Reihenfolge ist eine Rangfolge mit Zufallsanteil, keine Zeitachse.
create or replace function public.get_explore(p_limit int default 20, p_ausser uuid[] default '{}')
returns jsonb
language plpgsql
volatile            -- random() fuer die kleinen Accounts
security definer
set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  return jsonb_build_object('beitraege', coalesce((
    with kandidaten as (
      select po.id, po.created_at,
             (select count(*) from public.post_likes l where l.post_id = po.id) as likes,
             (select count(*) from public.post_comments c
               where c.post_id = po.id and c.status = 'visible') as kommentare,
             a.follower_count
        from public.posts po
        join public.profiles a on a.id = po.user_id
       where po.status = 'visible'
         and po.repost_of is null                       -- keine Reposts
         and po.user_id <> v_me
         and a.beitraege_oeffentlich
         and not exists (select 1 from public.follows f
                          where f.follower_id = v_me and f.followee_id = po.user_id)
         and not (po.id = any(coalesce(p_ausser, '{}')))
         and po.created_at > now() - interval '60 days'
    ),
    bewertet as (
      select k.*,
             (k.likes + 2 * k.kommentare + 1)
               / power(extract(epoch from now() - k.created_at) / 86400.0 + 1, 0.9) as punkte,
             (k.follower_count < 20 and k.likes < 5) as klein
        from kandidaten k
    ),
    -- Die Rangliste: Plaetze 1, 2, 3, 5, 6, 7, 9, ... (jeder vierte bleibt frei).
    gross as (
      select id, rn + (rn - 1) / 3 as platz
        from (select id, row_number() over (order by punkte desc, created_at desc) as rn
                from bewertet) x
    ),
    -- Die freien Plaetze 4, 8, 12, ... fuer kleine Accounts, zufaellig.
    klein as (
      select id, rn * 4 as platz
        from (select id, row_number() over (order by random()) as rn
                from bewertet where klein) x
    ),
    alle as (
      select distinct on (id) id, platz
        from (select * from klein union all select * from gross) u
       order by id, platz
    ),
    seite as (
      select id, platz from alle order by platz limit v_limit
    )
    select jsonb_agg(public.post_json(s.id, v_me) order by s.platz) from seite s
  ), '[]'::jsonb));
end
$fn$;

revoke execute on function public.get_explore(int, uuid[]) from anon;
grant  execute on function public.get_explore(int, uuid[]) to authenticated;

notify pgrst, 'reload schema';
