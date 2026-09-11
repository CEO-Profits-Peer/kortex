-- =============================================================================
-- 0001_foundation.sql  ·  Tabellen, Constraints, Indizes
-- Reihenfolge: Referenzdaten -> Content -> User -> Events -> Oekonomie -> Social
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists vector;

-- updated_at Helper -----------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end
$fn$;


-- =============================================================================
-- 1. REFERENZDATEN
-- =============================================================================

-- #kategorien: hierarchisch, levelbar, gleichzeitig Hashtag und Skill-Knoten
create table public.categories (
  id              text primary key,                    -- 'finanzen.zinseszins'
  slug            text unique not null,                -- 'zinseszins'  -> das # im Search-Tab
  parent_id       text references public.categories(id) on delete restrict,
  display_name    text not null,
  description     text,
  emoji           text,
  accent_hex      text default '#00F0FF',
  -- WICHTIG: News wird nicht "geleveled", Wissen schon (docs/XP-ECONOMY.md)
  kind            text not null check (kind in ('knowledge','news','meta')),
  is_levelable    boolean generated always as (kind = 'knowledge') stored,
  max_level       smallint not null default 10,
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id) where is_active;
create index categories_slug_trgm on public.categories using gin (slug gin_trgm_ops);

-- @quellen: Lizenz ist ein FELD, keine Policy im Kopf. Die Pipeline liest das.
create table public.sources (
  id                    text primary key,              -- 'apa-ots'
  handle                text unique not null,          -- '@apa-ots' im Search-Tab
  display_name          text not null,
  kind                  text not null check (kind in
                          ('agency','institution','journal','wiki','preprint','internal','creator')),
  homepage_url          text,
  logo_url              text,
  -- Steuert, WAS die Pipeline speichern darf:
  --   'owned'      = selbst erzeugt                      -> Volltext + Quiz
  --   'cc'         = CC-BY / CC0 / CC-BY-SA              -> Volltext + Quiz, Attribution Pflicht
  --   'press_free' = Presseaussendung zur freien Verwendung -> Volltext + Quiz
  --   'link_only'  = klassischer Presseartikel           -> NUR Titel + Link, KEINE Zusammenfassung
  license_class         text not null check (license_class in ('owned','cc','press_free','link_only')),
  license_name          text,
  license_url           text,
  attribution_required  boolean not null default true,
  attribution_template  text,
  trust_score           smallint not null default 50 check (trust_score between 0 and 100),
  default_region_code   text,
  default_language      text not null default 'de',
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);
create index sources_handle_trgm on public.sources using gin (handle gin_trgm_ops);

-- Feed-Mix, Schwellenwerte, XP-Saetze: tunebar OHNE Deploy
create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);


-- =============================================================================
-- 2. CONTENT
-- =============================================================================

create table public.content_items (
  id                   uuid primary key default gen_random_uuid(),

  content_type         text not null check (content_type in
                         ('news','knowledge','interactive','course_lesson','sponsor')),
  presentation_mode    text not null default 'text' check (presentation_mode in
                         ('text','voice','interactive','kinetic')),
  -- Redaktions-Gate: nichts geht ungeprueft live
  status               text not null default 'pending' check (status in
                         ('pending','approved','rejected','archived')),
  reject_reason        text,

  title                text not null,
  deck                 text,                             -- 1 Zeile Hook
  body_blocks          jsonb not null,                   -- [{type:'para'|'bullet'|'stat'|'quote'}]

  -- Herkunft. source_ids ist ein ARRAY: Multi-Source-Synthese ist der Normalfall.
  source_ids           text[] not null default '{}',
  source_urls          text[] not null default '{}',
  primary_source_id    text references public.sources(id) on delete set null,
  published_at         timestamptz,                      -- Datum der QUELLE, nicht unseres

  language             text not null default 'de',
  region_code          text,                             -- NULL = global, 'AT', 'AT-9'
  primary_category_id  text not null references public.categories(id) on delete restrict,
  category_ids         text[] not null default '{}',

  difficulty           smallint not null default 2 check (difficulty between 1 and 5),
  word_count           int not null default 0,
  -- Dwell-Ziel aus der Laenge abgeleitet, nicht pauschal 3s (docs/XP-ECONOMY.md)
  dwell_target_ms      int generated always as
                         (greatest(4000, least(20000, (word_count * 1000) / 3))) stored,

  interaction_template text,
  interaction_data     jsonb,
  quiz_items           jsonb not null default '[]'::jsonb,

  media                jsonb not null default '{}'::jsonb,

  content_hash         text,
  embedding            vector(768),
  cluster_id           uuid,                             -- gleiche Story aus N Quellen

  expires_at           timestamptz,
  quality_score        numeric(4,2),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index content_items_hash_uidx on public.content_items (content_hash)
  where content_hash is not null;
create index content_items_feed_idx on public.content_items
  (status, language, region_code, primary_category_id, published_at desc)
  where status = 'approved';
create index content_items_categories_idx on public.content_items using gin (category_ids);
create index content_items_cluster_idx on public.content_items (cluster_id) where cluster_id is not null;
create index content_items_title_trgm on public.content_items using gin (title gin_trgm_ops);

create trigger content_items_touch before update on public.content_items
  for each row execute function public.tg_touch_updated_at();

-- Interaktions-Templates (docs/INTERACTIONS.md) -------------------------------
create table public.interaction_templates (
  id            text primary key,          -- 'timeline_sort'
  display_name  text not null,
  description   text not null,
  json_schema   jsonb not null,            -- Gemini bekommt exakt dieses Schema
  base_xp       int not null default 30,
  base_mastery  int not null default 12,
  is_active     boolean not null default true
);
alter table public.content_items
  add constraint content_items_template_fk
  foreign key (interaction_template) references public.interaction_templates(id) on delete set null;


-- =============================================================================
-- 3. USER
-- =============================================================================

create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  handle                   text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name             text,
  avatar_seed              text not null default gen_random_uuid()::text,

  birth_year               smallint not null check (birth_year between 1900 and 2100),
  country_code             text not null default 'AT',
  region_code              text,
  timezone                 text not null default 'Europe/Vienna',
  language                 text not null default 'de',

  -- ---- ab hier: ausschliesslich serverseitig beschreibbar (0002_rls.sql)
  xp_total                 int not null default 0,
  mastery_total            int not null default 0,
  streak_current           smallint not null default 0,
  streak_best              smallint not null default 0,
  last_active_date         date,
  cards_read_total         int not null default 0,
  focus_seconds_total      int not null default 0,
  -- ----

  referral_code            text unique not null default upper(substr(md5(random()::text), 1, 7)),
  referred_by              uuid references public.profiles(id) on delete set null,
  plan                     text not null default 'free' check (plan in ('free','pro','gifted')),
  plan_expires_at          timestamptz,

  leaderboard_opt_in       boolean not null default true,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index profiles_handle_trgm on public.profiles using gin (handle gin_trgm_ops);
create index profiles_leaderboard_idx on public.profiles (region_code, mastery_total desc)
  where leaderboard_opt_in;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

-- Interessen-Graph UND Level-System in einer Tabelle
create table public.user_categories (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  category_id      text not null references public.categories(id) on delete cascade,
  interest_weight  numeric(4,2) not null default 1.00 check (interest_weight between 0 and 5),
  is_explicit      boolean not null default false,      -- im Onboarding gewaehlt vs. abgeleitet
  -- serverseitig:
  level            smallint not null default 1,
  category_xp      int not null default 0,
  mastery_score    int not null default 0,
  correct_streak   smallint not null default 0,
  difficulty_pref  smallint not null default 2 check (difficulty_pref between 1 and 5),
  updated_at       timestamptz not null default now(),
  primary key (user_id, category_id)
);
create index user_categories_level_idx on public.user_categories (category_id, mastery_score desc);


-- =============================================================================
-- 4. EVENTS & ATTENTION
-- =============================================================================

-- Append-only. Der Client puffert lokal und flusht gebuendelt (alle ~10 Cards).
create table public.content_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  content_id   uuid not null references public.content_items(id) on delete cascade,
  event_type   text not null check (event_type in
                 ('impression','dwell','like','unlike','skip','source_open',
                  'share','too_easy','too_hard','report')),
  dwell_ms     int,
  visible_pct  smallint,
  payload      jsonb not null default '{}'::jsonb,
  client_ts    timestamptz not null,
  created_at   timestamptz not null default now()
);
create index content_events_user_idx on public.content_events (user_id, created_at desc);
create index content_events_content_idx on public.content_events (content_id, event_type);

-- Aggregat: eine Zeile pro (user, card). Der Feed filtert hierueber.
create table public.user_content_state (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  content_id        uuid not null references public.content_items(id) on delete cascade,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  total_dwell_ms    int not null default 0,
  is_read_validated boolean not null default false,
  is_liked          boolean not null default false,
  is_skipped        boolean not null default false,
  quiz_attempts     smallint not null default 0,
  quiz_correct      smallint not null default 0,
  xp_awarded        boolean not null default false,   -- Anti-Doppel-XP
  primary key (user_id, content_id)
);
create index ucs_user_seen_idx on public.user_content_state (user_id, last_seen_at desc);


-- =============================================================================
-- 5. LERN-OEKONOMIE
-- =============================================================================

-- Jeder XP-Punkt hat eine Herkunftszeile. Einzige Schreibstelle: SECURITY DEFINER Funktionen.
create table public.xp_ledger (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  xp_amount      int not null,
  mastery_amount int not null default 0,
  kind           text not null check (kind in
                   ('read','quiz_correct','quiz_retry','interactive','batch_bonus',
                    'review_correct','streak','achievement','referral','gift')),
  category_id    text references public.categories(id) on delete set null,
  ref_type       text,
  ref_id         text,
  created_at     timestamptz not null default now()
);
create index xp_ledger_user_idx on public.xp_ledger (user_id, created_at desc);
create unique index xp_ledger_dedupe_uidx on public.xp_ledger (user_id, kind, ref_type, ref_id)
  where ref_id is not null;

-- Spaced Repetition (SM-2 lite). Der Unterschied zwischen App und Lern-App.
create table public.review_queue (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  content_id     uuid not null references public.content_items(id) on delete cascade,
  quiz_index     smallint not null default 0,
  category_id    text not null references public.categories(id) on delete cascade,
  ease           numeric(3,2) not null default 2.50,
  interval_days  smallint not null default 0,
  repetitions    smallint not null default 0,
  lapses         smallint not null default 0,
  due_at         timestamptz not null default now(),
  last_reviewed  timestamptz,
  is_retired     boolean not null default false,     -- 4x richtig in Folge -> Ruhe
  unique (user_id, content_id, quiz_index)
);
create index review_queue_due_idx on public.review_queue (user_id, due_at)
  where not is_retired;

create table public.achievements (
  id          text primary key,
  title       text not null,
  description text not null,
  emoji       text,
  xp_reward   int not null default 0,
  criteria    jsonb not null,          -- datengetrieben, kein Hardcoding im Client
  is_secret   boolean not null default false,
  sort_order  int not null default 0
);
create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);


-- =============================================================================
-- 6. KURSE
-- =============================================================================

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  description  text not null,
  category_id  text not null references public.categories(id) on delete restrict,
  difficulty   smallint not null default 2 check (difficulty between 1 and 5),
  language     text not null default 'de',
  cover        jsonb not null default '{}'::jsonb,
  is_premium   boolean not null default false,
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);
create index courses_slug_trgm on public.courses using gin (slug gin_trgm_ops);

create table public.course_lessons (
  course_id  uuid not null references public.courses(id) on delete cascade,
  position   smallint not null,
  content_id uuid not null references public.content_items(id) on delete restrict,
  primary key (course_id, position)
);
create table public.user_course_progress (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  current_position  smallint not null default 0,
  completed_at      timestamptz,
  started_at        timestamptz not null default now(),
  primary key (user_id, course_id)
);


-- =============================================================================
-- 7. SOCIAL & WACHSTUM
-- =============================================================================

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id, status);

create table public.referrals (
  id            uuid primary key default gen_random_uuid(),
  inviter_id    uuid not null references public.profiles(id) on delete cascade,
  invitee_id    uuid unique not null references public.profiles(id) on delete cascade,
  validated_at  timestamptz,                -- erst nach 3 validierten Lesetagen -> Anti-Farming
  reward_issued boolean not null default false,
  created_at    timestamptz not null default now()
);


-- =============================================================================
-- 8. SPONSOR CARDS  (DSA Art. 28: keine Personalisierung fuer Minderjaehrige)
-- =============================================================================

create table public.sponsor_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  advertiser           text not null,
  headline             text not null,
  body                 text not null,
  cta_label            text not null,
  cta_url              text not null,
  logo_url             text,
  category_ids         text[] not null default '{}',
  region_codes         text[] not null default '{}',
  -- Wenn true, darf die Kampagne NUR an >= 18 ausgespielt werden.
  is_personalized      boolean not null default false,
  min_age              smallint not null default 0,
  daily_impression_cap int,
  active_from          timestamptz not null default now(),
  active_to            timestamptz,
  is_active            boolean not null default false,
  created_at           timestamptz not null default now()
);
create table public.sponsor_impressions (
  id          bigint generated always as identity primary key,
  campaign_id uuid not null references public.sponsor_campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  clicked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index sponsor_impressions_campaign_idx on public.sponsor_impressions (campaign_id, created_at desc);
