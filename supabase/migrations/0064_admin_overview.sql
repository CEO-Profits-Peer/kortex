-- =============================================================================
-- 0064_admin_overview.sql  ·  Ein Kontrollzentrum, das nur einer sieht
--
-- Bisher habe ich jede Zahl ueber diesen Bestand von Hand mit dem
-- service_role Key gezogen. Das geht fuer mich, aber nicht fuer dich: der
-- Schluessel umgeht JEDE Regel dieser Datenbank und darf nie in einen
-- Browser. Also wandert die Auswertung dorthin, wo sie hingehoert - in eine
-- Funktion, die die Datenbank selbst ausfuehrt und die vorher prueft, wer
-- fragt.
--
-- Zwei Schloesser, absichtlich verschiedene
-- ----------------------------------------
--   1. `is_admin` am Profil. Wer es nicht hat, bekommt nichts - egal was er
--      schickt.
--   2. Eine PIN, die als bcrypt-Hash am Profil liegt und bei JEDEM Aufruf
--      mitgeschickt werden muss.
--
-- Das zweite Schloss ist nicht doppelt gemoppelt. Das erste haengt an der
-- Sitzung: wer das entsperrte Telefon in der Hand haelt, ist angemeldet. Das
-- zweite haengt an etwas, das man wissen muss. Der Unterschied zaehlt genau
-- in dem Fall, fuer den man so eine Seite ueberhaupt absichert.
--
-- Alle drei Fehlerfaelle - nicht angemeldet, kein Admin, falsche PIN -
-- melden DASSELBE. Eine Meldung "Admin ja, PIN falsch" waere die Auskunft,
-- dass sich Weiterprobieren lohnt.
--
-- Was hier NICHT drin ist: Einzelpersonen. Keine Zeile sagt, was ein
-- bestimmtes Konto gelesen hat. Nicht weil es schwer waere - es ist trivial
-- -, sondern weil ein Kontrollzentrum, das erst einmal alles anzeigt, nie
-- wieder zurueckgebaut wird. Wer spaeter eine einzelne Sitzung untersuchen
-- muss, baut das als eigene Funktion mit eigener Begruendung.
--
-- Wer Admin ist, steht NICHT in dieser Datei. Das Repo ist oeffentlich; der
-- Name des einzigen Kontos mit Zugang hat darin nichts verloren. Die beiden
-- Zeilen zum Freischalten stehen in docs/ADMIN.md.
-- =============================================================================

-- --- Voraussetzung pruefen, statt kryptisch zu scheitern ---------------------
--
-- bcrypt kommt aus pgcrypto, und in Supabase liegt die Erweiterung im Schema
-- `extensions`. Sollte das je anders sein, soll hier ein Satz stehen, den man
-- lesen kann - nicht "function crypt(text, text) does not exist" irgendwo in
-- der Mitte.
do $pruefung$
begin
  if to_regprocedure('extensions.crypt(text,text)') is null then
    raise exception
      'pgcrypto fehlt im Schema extensions. Einmalig ausfuehren: create extension if not exists pgcrypto with schema extensions;';
  end if;
end
$pruefung$;


alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Der Hash, nicht die PIN. Hier steht nie ein lesbarer Wert.
alter table public.profiles
  add column if not exists admin_pin_hash text;

comment on column public.profiles.is_admin is
  'Darf admin_overview() aufrufen. Wird von Hand gesetzt, nie von der App.';
comment on column public.profiles.admin_pin_hash is
  'bcrypt-Hash der Admin-PIN. Wird von Hand gesetzt, siehe docs/ADMIN.md.';


-- =============================================================================
-- Die Uebersicht
--
-- EIN Aufruf, ein jsonb. Nicht zehn kleine Funktionen: die Seite zeigt alles
-- gleichzeitig, und zehn Rundreisen ueber das Netz waeren zehn Gelegenheiten,
-- dass eine haengt und die Seite halb gefuellt dasteht.
-- =============================================================================
create or replace function public.admin_overview(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_admin boolean;
  v_hash  text;
  v_out   jsonb;
begin
  select p.is_admin, p.admin_pin_hash into v_admin, v_hash
    from public.profiles p where p.id = v_me;

  -- Ein Satz fuer alles. Siehe Kopf.
  if v_me is null
     or not coalesce(v_admin, false)
     or v_hash is null
     or v_hash <> extensions.crypt(coalesce(p_pin, ''), v_hash) then
    raise exception 'kein Zugang';
  end if;

  select jsonb_build_object(

    -- --- 1. Betrieb: laeuft die Maschine? ---------------------------------
    'betrieb', jsonb_build_object(
      'quellen_aktiv', (select count(*) from public.sources where is_active),
      'quellen_mit_fehler', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', s.id,
                 'fehler', left(s.last_error, 120),
                 'zuletzt', s.last_fetched_at)), '[]'::jsonb)
        from public.sources s
        where s.is_active and s.last_error is not null
      ),
      'quelle_am_laengsten_still', (
        select jsonb_build_object('id', s.id, 'zuletzt', s.last_fetched_at)
        from public.sources s
        where s.is_active
          and s.feed_urls is not null
          and array_length(s.feed_urls, 1) > 0
        order by s.last_fetched_at asc nulls first
        limit 1
      ),
      'wartet_auf_freigabe', (
        select count(*) from public.content_items where status = 'pending'
      ),
      'karten_24h', (
        select count(*) from public.content_items
        where created_at > now() - interval '24 hours'
      ),
      'karten_7t', (
        select count(*) from public.content_items
        where created_at > now() - interval '7 days'
      ),
      'datenbank_bytes', pg_catalog.pg_database_size(pg_catalog.current_database())
    ),

    -- --- 2. Bestand: was ist da? ------------------------------------------
    'bestand', jsonb_build_object(
      'freigegeben', (select count(*) from public.content_items where status = 'approved'),
      'wartend',     (select count(*) from public.content_items where status = 'pending'),
      'abgelehnt',   (select count(*) from public.content_items where status = 'rejected'),
      'erklaerkarten', (
        select count(*) from public.content_items
        where status = 'approved' and presentation_mode = 'kinetic'
      ),
      'je_sprache', (
        select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select jsonb_build_object(
                   'sprache', ci.language,
                   'karten', count(*),
                   'erklaerkarten', count(*) filter (where ci.presentation_mode = 'kinetic')
                 ) as z
          from public.content_items ci
          where ci.status = 'approved'
          group by ci.language
          order by ci.language
        ) q
      ),
      'kategorien_leer', (
        select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb)
        from public.categories c
        where c.parent_id is not null and c.is_active
          and not exists (
            select 1 from public.content_items ci
            where ci.primary_category_id = c.id and ci.status = 'approved'
          )
      ),
      'kategorien_gross', (
        select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select jsonb_build_object('id', ci.primary_category_id, 'karten', count(*)) as z
          from public.content_items ci
          where ci.status = 'approved'
          group by ci.primary_category_id
          order by count(*) desc
          limit 8
        ) q
      )
    ),

    -- --- 3. Nutzung: kommt jemand wieder? ---------------------------------
    --
    -- "Online" heisst hier: ein Ereignis in den letzten fuenfzehn Minuten.
    -- Eine echte Praesenzanzeige gibt es nicht, und fuer die Frage "ist
    -- gerade jemand da" braucht es sie auch nicht.
    'nutzung', jsonb_build_object(
      'aktiv_15min', (
        select count(distinct ce.user_id) from public.content_events ce
        where ce.created_at > now() - interval '15 minutes'
      ),
      'aktiv_24h', (
        select count(distinct ce.user_id) from public.content_events ce
        where ce.created_at > now() - interval '24 hours'
      ),
      'aktiv_7t', (
        select count(distinct ce.user_id) from public.content_events ce
        where ce.created_at > now() - interval '7 days'
      ),
      'aktiv_30t', (
        select count(distinct ce.user_id) from public.content_events ce
        where ce.created_at > now() - interval '30 days'
      ),
      'konten', (select count(*) from public.profiles),
      'konten_neu_7t', (
        select count(*) from public.profiles where created_at > now() - interval '7 days'
      ),
      'ereignisse_7t', (
        select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select jsonb_build_object('art', ce.event_type, 'anzahl', count(*)) as z
          from public.content_events ce
          where ce.created_at > now() - interval '7 days'
          group by ce.event_type
          order by count(*) desc
        ) q
      )
    ),

    -- --- 4. Aufmerksamkeit: gelesen oder gewischt? ------------------------
    'aufmerksamkeit', jsonb_build_object(
      'paare',    (select count(*) from public.user_content_state),
      'gelesen',  (select count(*) from public.user_content_state where is_read_validated),
      'geskippt', (select count(*) from public.user_content_state where is_skipped),
      'geliked',  (select count(*) from public.user_content_state where is_liked),
      'verweildauer_median_ms', (
        select coalesce(percentile_cont(0.5) within group (order by total_dwell_ms), 0)
        from public.user_content_state
      ),
      'verweildauer_p90_ms', (
        select coalesce(percentile_cont(0.9) within group (order by total_dwell_ms), 0)
        from public.user_content_state
      )
    ),

    -- --- 5. Inhalt: was funktioniert? -------------------------------------
    'inhalt', jsonb_build_object(
      'beliebt', (
        select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select jsonb_build_object(
                   'titel', ci.title,
                   'likes', ci.like_count,
                   'kategorie', ci.primary_category_id) as z
          from public.content_items ci
          where ci.status = 'approved' and ci.like_count > 0
          order by ci.like_count desc, ci.created_at desc
          limit 6
        ) q
      ),
      'weggewischt', (
        select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select jsonb_build_object(
                   'titel', ci.title,
                   'anzahl', count(*),
                   'kategorie', ci.primary_category_id) as z
          from public.user_content_state ucs
          join public.content_items ci on ci.id = ucs.content_id
          where ucs.is_skipped
          group by ci.id, ci.title, ci.primary_category_id
          order by count(*) desc
          limit 6
        ) q
      ),
      'lesequote_je_kategorie', (
        select coalesce(jsonb_agg(z), '[]'::jsonb) from (
          select jsonb_build_object(
                   'id', ci.primary_category_id,
                   'gesehen', count(*),
                   'gelesen', count(*) filter (where ucs.is_read_validated)) as z
          from public.user_content_state ucs
          join public.content_items ci on ci.id = ucs.content_id
          group by ci.primary_category_id
          having count(*) >= 5
          order by count(*) desc
          limit 10
        ) q
      ),
      'zu_leicht', (select count(*) from public.content_events where event_type = 'too_easy'),
      'zu_schwer', (select count(*) from public.content_events where event_type = 'too_hard')
    ),

    'stand', now()
  ) into v_out;

  return v_out;
end
$fn$;

revoke execute on function public.admin_overview(text) from anon;
grant  execute on function public.admin_overview(text) to authenticated;
