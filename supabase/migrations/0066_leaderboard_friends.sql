-- =============================================================================
-- 0066_leaderboard_friends.sql  ·  Freunde sind gegenseitige Follows
--
-- Die Rangliste hatte von Anfang an einen Reiter "Freunde", und der war von
-- Anfang an leer. Er fragte `public.friendships` mit status = 'accepted' ab -
-- eine Tabelle aus 0016, in die nie jemand etwas schreibt. Es gibt in der
-- ganzen App keinen Knopf fuer eine Freundschaftsanfrage, und es soll auch
-- keinen geben: die App hat bereits einen sozialen Graphen, naemlich Follows.
--
-- Freund heisst ab jetzt: ich folge dir UND du folgst mir. Das ist die
-- uebliche Bedeutung ("wir kennen uns") und braucht keinen zweiten
-- Mechanismus mit eigenem Posteingang, eigenen Benachrichtigungen und eigener
-- Ablehnungslogik.
--
-- `friendships` bleibt stehen und wird nicht geloescht - sie ist leer, tut
-- niemandem weh, und ein drop in einer Migration, die eigentlich eine
-- Rangliste repariert, ist genau die Art von Nebenwirkung, die man ein Jahr
-- spaeter sucht.
--
-- Zweitens: Profilbilder. Die Rangliste malte bisher ein farbiges Quadrat aus
-- dem avatar_seed, weil `public_profiles` den Bildpfad nicht mitliefert -
-- die Tagesliste (get_daily_leaderboard) zeigt an derselben Stelle das echte
-- Bild. Dieselben Leute sahen also je nach Liste anders aus.
-- =============================================================================

-- --- Die Sicht bekommt den Bildpfad ------------------------------------------
--
-- Vollstaendig aus 0002_rls.sql wiederholt, inklusive security_invoker = off:
-- create or replace view ersetzt die Definition, es gibt kein Teil-Update.
create or replace view public.public_profiles
with (security_invoker = off) as
select
  p.id, p.handle, p.display_name, p.avatar_seed, p.avatar_path, p.region_code,
  p.mastery_total, p.streak_current, p.leaderboard_opt_in
from public.profiles p
where p.leaderboard_opt_in;

grant select on public.public_profiles to authenticated;


-- --- Die Rangliste ------------------------------------------------------------
--
-- drop und neu, nicht create or replace: die Rueckgabespalten aendern sich
-- (avatar_path kommt dazu), und das laesst PostgreSQL bei replace nicht zu.
drop function if exists public.get_leaderboard(text, int);

create function public.get_leaderboard(
  p_scope text default 'region',      -- 'region' | 'friends' | 'global'
  p_limit int default 50
) returns table (rank_pos int, handle text, display_name text, avatar_seed text,
                 avatar_path text, mastery_total int, streak_current smallint,
                 is_me boolean)
language sql security definer set search_path = ''
as $fn$
  with me as (select id, region_code from public.profiles where id = auth.uid()),
  scoped as (
    select pp.* from public.public_profiles pp, me
     where case p_scope
             when 'region'  then pp.region_code is not distinct from me.region_code
             -- Ich selbst bin immer dabei: eine Freundesliste, in der man den
             -- eigenen Stand nicht sieht, beantwortet die Frage nicht, fuer
             -- die man sie aufmacht.
             when 'friends' then pp.id = me.id or (
                    exists (select 1 from public.follows f
                             where f.follower_id = me.id and f.followee_id = pp.id)
                and exists (select 1 from public.follows g
                             where g.follower_id = pp.id and g.followee_id = me.id))
             else true
           end
  )
  select (row_number() over (order by s.mastery_total desc))::int,
         s.handle, s.display_name, s.avatar_seed, s.avatar_path,
         s.mastery_total, s.streak_current,
         s.id = (select id from me)
    from scoped s
   order by s.mastery_total desc
   limit p_limit;
$fn$;

grant execute on function public.get_leaderboard(text, int) to authenticated;
