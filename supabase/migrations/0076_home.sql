-- =============================================================================
-- 0076_home.sql  ·  Home: was die Leute machen, denen ich folge
--
-- Der neue erste Tab. Sein Zweck ist ausdruecklich nicht "dein Stand" - der
-- steht im Profil -, sondern die anderen: was sie empfehlen, fragen, gewinnen,
-- abschliessen. Wer das sieht, macht eher selbst etwas, und genau darum geht
-- es. Bisher gab es davon nur get_following_feed (0020), und das kannte nur
-- Reposts und lag hinter einem Knopf im Profil.
--
-- EIN Aufruf, ein jsonb, wie beim Kontrollzentrum: der Bildschirm zeigt alles
-- auf einmal, und sechs Rundreisen waeren sechs Gelegenheiten, dass eine
-- haengt.
--
-- Was hinein darf - und was nicht
-- -------------------------------
-- "Folgen" reicht, gegenseitig muss es nicht sein. Bei 44 Follows gibt es
-- zwei gegenseitige Paare; ein Home nur fuer die waere fuer fast alle leer.
--
--   repost     oeffentlich schon heute (Profil, get_following_feed)
--   frage      oeffentlich schon heute (unter der Karte), nur 'visible'
--   folgt      oeffentlich schon heute (Follower-Listen)
--   kurs       NUR wenn die Person auf der Rangliste erscheinen will
--   abzeichen  dito, und keine geheimen Abzeichen
--   duell      nur wenn BEIDE auf der Rangliste erscheinen wollen - ein
--              Ergebnis hat zwei Seiten, und die verlierende hat nie
--              zugestimmt, dass Fremde es sehen
--
-- Lernfortschritt ist etwas anderes als eine Empfehlung: die eine teilt man
-- absichtlich, den anderen hinterlaesst man. leaderboard_opt_in ist die
-- einzige Einstellung, mit der jemand bisher gesagt hat "meine Lernzahlen
-- duerfen andere sehen" - also gilt sie hier. Likes kommen gar nicht vor,
-- aus dem Grund, der in FollowingFeedScreen steht.
--
-- Nicht dabei: Ereignisse von mir selbst. Home zeigt die anderen.
-- =============================================================================

create or replace function public.get_home(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_seit  timestamptz := now() - interval '30 days';
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  return (
    with folge as (
      select f.followee_id as id
        from public.follows f
       where f.follower_id = v_me
    ),
    person as (
      select p.id, p.handle,
             coalesce(nullif(trim(p.display_name), ''), p.handle) as name,
             p.avatar_seed, p.avatar_path,
             p.leaderboard_opt_in as offen
        from public.profiles p
       where p.id in (select id from folge)
    ),
    eintraege as (
      -- Empfehlungen
      select 'repost'::text as art, r.created_at as at, r.user_id as wer,
             jsonb_build_object(
               'content_id', ci.id, 'title', ci.title, 'deck', ci.deck,
               'category', ci.primary_category_id, 'comment', r.comment) as was
        from public.reposts r
        join public.content_items ci on ci.id = r.content_id and ci.status = 'approved'
       where r.user_id in (select id from folge)
         and r.created_at >= v_seit

      union all
      -- Fragen unter Karten (keine Antworten - eine Antwort ohne ihre Frage
      -- ist im Home unverstaendlich)
      select 'frage', c.created_at, c.user_id,
             jsonb_build_object('content_id', ci.id, 'title', ci.title, 'body', c.body)
        from public.comments c
        join public.content_items ci on ci.id = c.content_id and ci.status = 'approved'
       where c.user_id in (select id from folge)
         and c.status = 'visible'
         and c.parent_id is null
         and c.created_at >= v_seit

      union all
      -- Duelle, die beide zu Ende gespielt haben
      select 'duell', greatest(pa.finished_at, pb.finished_at),
             case when d.challenger in (select id from folge) then d.challenger else d.opponent end,
             jsonb_build_object(
               'a', jsonb_build_object(
                      'handle', ca.handle,
                      'name', coalesce(nullif(trim(ca.display_name), ''), ca.handle),
                      'avatar_seed', ca.avatar_seed, 'avatar_path', ca.avatar_path,
                      'punkte', pa.correct, 'ich', ca.id = v_me),
               'b', jsonb_build_object(
                      'handle', cb.handle,
                      'name', coalesce(nullif(trim(cb.display_name), ''), cb.handle),
                      'avatar_seed', cb.avatar_seed, 'avatar_path', cb.avatar_path,
                      'punkte', pb.correct, 'ich', cb.id = v_me))
        from public.duels d
        join public.duel_plays pa on pa.duel_id = d.id and pa.user_id = d.challenger
                                 and pa.finished_at is not null
        join public.duel_plays pb on pb.duel_id = d.id and pb.user_id = d.opponent
                                 and pb.finished_at is not null
        join public.profiles ca on ca.id = d.challenger
        join public.profiles cb on cb.id = d.opponent
       where (d.challenger in (select id from folge) or d.opponent in (select id from folge))
         and ca.leaderboard_opt_in and cb.leaderboard_opt_in
         and greatest(pa.finished_at, pb.finished_at) >= v_seit

      union all
      -- Abgeschlossene Kurse: alle Lektionen serverseitig als gelesen bestaetigt
      select 'kurs', k.at, k.user_id,
             jsonb_build_object('slug', co.slug, 'title', co.title, 'lessons', g.gesamt)
        from (
          select ucs.user_id, cl.course_id,
                 count(*) as gelesen,
                 max(ucs.last_seen_at) as at
            from public.course_lessons cl
            join public.user_content_state ucs
              on ucs.content_id = cl.content_id and ucs.is_read_validated
           where ucs.user_id in (select id from person where offen)
           group by ucs.user_id, cl.course_id
        ) k
        join public.courses co on co.id = k.course_id and co.is_published
        cross join lateral (
          select count(*) as gesamt from public.course_lessons x where x.course_id = co.id
        ) g
       where k.gelesen >= g.gesamt
         and k.at >= v_seit

      union all
      -- Abzeichen
      select 'abzeichen', ua.unlocked_at, ua.user_id,
             jsonb_build_object('title', a.title, 'emoji', a.emoji)
        from public.user_achievements ua
        join public.achievements a on a.id = ua.achievement_id
       where ua.user_id in (select id from person where offen)
         and not a.is_secret
         and ua.unlocked_at >= v_seit

      union all
      -- Wem meine Leute neu folgen
      select 'folgt', f.created_at, f.follower_id,
             jsonb_build_object(
               'handle', p.handle,
               'name', coalesce(nullif(trim(p.display_name), ''), p.handle),
               'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
               'bin_ich', p.id = v_me)
        from public.follows f
        join public.profiles p on p.id = f.followee_id
       where f.follower_id in (select id from folge)
         and f.created_at >= v_seit
    )
    select jsonb_build_object(
      'eintraege', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'art', e.art,
                 'at',  e.at,
                 'wer', jsonb_build_object(
                          'handle', p.handle, 'name', p.name,
                          'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path),
                 'was', e.was
               ) order by e.at desc)
          from (select * from eintraege order by at desc limit v_limit) e
          join person p on p.id = e.wer
      ), '[]'::jsonb),

      -- Die Kopfleiste: wer von meinen Leuten zuletzt etwas gemacht hat.
      'leute', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'handle', p.handle, 'name', p.name,
                 'avatar_seed', p.avatar_seed, 'avatar_path', p.avatar_path,
                 'zuletzt', l.zuletzt
               ) order by l.zuletzt desc)
          from (select wer, max(at) as zuletzt from eintraege group by wer) l
          join person p on p.id = l.wer
      ), '[]'::jsonb),

      'folge_ich', (select count(*) from folge),

      -- Wem man folgen koennte. Zuerst, wer mir schon folgt; dann, wem meine
      -- Leute folgen; dann, wer ueberhaupt Follower hat. Frisch angelegte
      -- Konten ohne jede Verbindung sind keine Empfehlung, sondern eine Liste.
      'vorschlaege', coalesce((
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
             limit 8
          ) v
      ), '[]'::jsonb)
    )
  );
end
$fn$;

revoke execute on function public.get_home(int) from anon;
grant  execute on function public.get_home(int) to authenticated;

notify pgrst, 'reload schema';
