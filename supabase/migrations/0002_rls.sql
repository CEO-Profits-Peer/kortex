-- =============================================================================
-- 0002_rls.sql  ·  Row Level Security + Spalten-Rechte
--
-- Grundregel: In Supabase ist eine Tabelle OHNE aktivierte RLS oeffentlich les-
-- UND schreibbar. Jede Tabelle bekommt daher RLS, auch die, die "eh nur lesen".
--
-- Zweite Grundregel: XP, Mastery, Streak und Level sind fuer den Client
-- SCHREIBGESCHUETZT. Ohne das setzt sich jeder mit dem Anon-Key per curl auf
-- Platz 1 des Leaderboards.
-- =============================================================================

alter table public.categories             enable row level security;
alter table public.sources                enable row level security;
alter table public.app_config             enable row level security;
alter table public.content_items          enable row level security;
alter table public.interaction_templates  enable row level security;
alter table public.profiles               enable row level security;
alter table public.user_categories        enable row level security;
alter table public.content_events         enable row level security;
alter table public.user_content_state     enable row level security;
alter table public.xp_ledger              enable row level security;
alter table public.review_queue           enable row level security;
alter table public.achievements           enable row level security;
alter table public.user_achievements      enable row level security;
alter table public.courses                enable row level security;
alter table public.course_lessons         enable row level security;
alter table public.user_course_progress   enable row level security;
alter table public.friendships            enable row level security;
alter table public.referrals              enable row level security;
alter table public.sponsor_campaigns      enable row level security;
alter table public.sponsor_impressions    enable row level security;


-- =============================================================================
-- Referenzdaten: fuer alle Eingeloggten lesbar, fuer niemanden schreibbar
-- (Schreiben passiert ausschliesslich mit dem service_role Key aus der Pipeline)
-- =============================================================================

create policy "ref read" on public.categories
  for select to authenticated using (is_active);
create policy "ref read" on public.sources
  for select to authenticated using (is_active);
create policy "ref read" on public.interaction_templates
  for select to authenticated using (is_active);
create policy "ref read" on public.achievements
  for select to authenticated using (true);
create policy "ref read" on public.app_config
  for select to authenticated using (true);


-- =============================================================================
-- Content: nur freigegebene, nicht abgelaufene Items
-- =============================================================================

create policy "approved content only" on public.content_items
  for select to authenticated
  using (status = 'approved' and (expires_at is null or expires_at > now()));

create policy "published courses" on public.courses
  for select to authenticated using (is_published);
create policy "lessons of published courses" on public.course_lessons
  for select to authenticated using (
    exists (select 1 from public.courses c where c.id = course_id and c.is_published)
  );


-- =============================================================================
-- Profile
-- =============================================================================

-- Eigenes Profil voll lesbar. Fremde Profile NUR ueber die View unten.
create policy "own profile read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "own profile update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Kein INSERT-Policy: Profile entstehen ausschliesslich per Trigger auf auth.users.
-- Kein DELETE-Policy: Loeschung laeuft ueber auth.users (Cascade).

-- ---- Spalten-Rechte: das eigentliche Anti-Cheat -----------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  display_name, avatar_seed, region_code, country_code, timezone, language,
  leaderboard_opt_in
) on public.profiles to authenticated;
-- xp_total, mastery_total, streak_*, cards_read_total, focus_seconds_total,
-- plan, referral_code, referred_by, birth_year, handle sind damit fuer den
-- Client nicht mehr beschreibbar.

-- Oeffentliches Profil (Leaderboard, Freundesliste, @-Suche)
create or replace view public.public_profiles
with (security_invoker = off) as
select
  p.id, p.handle, p.display_name, p.avatar_seed, p.region_code,
  p.mastery_total, p.streak_current, p.leaderboard_opt_in
from public.profiles p
where p.leaderboard_opt_in;

grant select on public.public_profiles to authenticated;


-- =============================================================================
-- User-eigene Daten
-- =============================================================================

create policy "own rows" on public.user_categories
  for select to authenticated using (user_id = (select auth.uid()));
-- Interessen aendern der Nutzer, Level/XP NICHT:
revoke all on public.user_categories from anon, authenticated;
grant select on public.user_categories to authenticated;

create policy "own rows" on public.user_content_state
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_content_state from anon, authenticated;
grant select on public.user_content_state to authenticated;

create policy "own rows read" on public.xp_ledger
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.xp_ledger from anon, authenticated;
grant select on public.xp_ledger to authenticated;   -- lesen ja, schreiben nie

create policy "own rows" on public.review_queue
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.review_queue from anon, authenticated;
grant select on public.review_queue to authenticated;

create policy "own rows" on public.user_achievements
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.user_course_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Events darf der Client als einziges direkt schreiben - aber nur eigene,
-- und nur ohne Rueckdatierung in die Zukunft.
create policy "own events insert" on public.content_events
  for insert to authenticated
  with check (user_id = (select auth.uid()) and client_ts <= now() + interval '5 minutes');
create policy "own events read" on public.content_events
  for select to authenticated using (user_id = (select auth.uid()));


-- =============================================================================
-- Social
-- =============================================================================

create policy "own friendships read" on public.friendships
  for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy "send request" on public.friendships
  for insert to authenticated with check (requester_id = (select auth.uid()));
create policy "answer request" on public.friendships
  for update to authenticated using (addressee_id = (select auth.uid()));

create policy "own referrals read" on public.referrals
  for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));


-- =============================================================================
-- Sponsoren
-- =============================================================================

-- Kampagnen kommen nur ueber get_feed() zum Nutzer, nie per Direktabfrage.
create policy "no direct campaign read" on public.sponsor_campaigns
  for select to authenticated using (false);

create policy "own impressions insert" on public.sponsor_impressions
  for insert to authenticated with check (user_id = (select auth.uid()));
