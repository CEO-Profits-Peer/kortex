-- =============================================================================
-- 0091_pro.sql  ·  PRO: Status, Codes, Grenzen, Anpinnen, Profilbild-Stile
--
-- Noch ohne Bezahlung. Wer PRO ist, entscheidet AUSSCHLIESSLICH der Server:
--   profiles.plan ('free' | 'pro' | 'gifted') und plan_expires_at gibt es seit
--   0001, und der Client darf beide nicht schreiben (Spaltenrechte aus 0002).
--   'pro' ist spaeter der Kauf (RevenueCat), 'gifted' ein eingeloester Code.
--
-- Was PRO jetzt wirklich aendert (durchgesetzt HIER, nicht nur in der App):
--   Beitragstext   500  -> 1500 Zeichen
--   Umfrage        4    -> 6 Antworten
--   Quiz           3    -> 3 oder 4 Antworten
--   Stapel         10   -> 50 Karten
--   Anpinnen       1    -> 3 Beitraege
--   Profilbild     Stile Metall/Glas und vier besondere Gruende
--   Abzeichen      'pro' in post_json.wer und get_public_profile
--
-- Laeuft PRO ab, bleibt Bestehendes stehen (angepinnt, grosse Stapel,
-- Profilbild). Neues geht dann nur noch in den freien Grenzen. Etwas
-- wegzunehmen, das schon da ist, fuehlt sich an wie eine Strafe.
--
-- Codes: gespeichert wird nur der SHA-256 des normalisierten Codes
-- (Grossbuchstaben, ohne Leerzeichen und Striche). Wer die Tabelle liest,
-- kann keinen Code einloesen. Fehlversuche werden gezaehlt und NICHT per
-- Exception gemeldet - eine Exception rollte auch den Zaehler zurueck, und
-- Durchprobieren waere unbegrenzt.
--
-- Vollstaendig uebernommen: create_post (0090), post_json (0088),
-- get_user_posts (0084), get_public_profile (0083).
-- =============================================================================

-- --- PRO-Status ---------------------------------------------------------------------
create or replace function public.ist_pro(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select p.plan in ('pro', 'gifted')
           and (p.plan_expires_at is null or p.plan_expires_at > now())
      from public.profiles p where p.id = p_user
  ), false);
$fn$;
revoke execute on function public.ist_pro(uuid) from anon;
grant execute on function public.ist_pro(uuid) to authenticated;

-- --- Codes ---------------------------------------------------------------------------
create table if not exists public.pro_codes (
  id               uuid primary key default gen_random_uuid(),
  code_hash        text not null unique,
  tage             int  not null check (tage between 1 and 3650),
  max_einloesungen int  not null default 1 check (max_einloesungen >= 1),
  eingeloest       int  not null default 0,
  gueltig_bis      timestamptz,
  notiz            text,
  created_at       timestamptz not null default now()
);
create table if not exists public.pro_code_einloesungen (
  code_id uuid not null references public.pro_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (code_id, user_id)
);
create table if not exists public.pro_code_versuche (
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists pro_code_versuche_idx on public.pro_code_versuche (user_id, at desc);

alter table public.pro_codes             enable row level security;
alter table public.pro_code_einloesungen enable row level security;
alter table public.pro_code_versuche     enable row level security;
revoke all on public.pro_codes, public.pro_code_einloesungen, public.pro_code_versuche
  from anon, authenticated;

create or replace function public.pro_code_hash(p_code text)
returns text
language sql immutable set search_path = ''
as $fn$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$fn$;
revoke execute on function public.pro_code_hash(text) from anon, authenticated;

create or replace function public.pro_code_einloesen(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_norm  text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code  public.pro_codes;
  v_bis   timestamptz;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;

  if (select count(*) from public.pro_code_versuche
       where user_id = v_me and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'fehler', 'Zu viele Versuche. Probier es in einer Stunde nochmal.');
  end if;
  insert into public.pro_code_versuche (user_id) values (v_me);

  if length(v_norm) not between 6 and 40 then
    return jsonb_build_object('ok', false, 'fehler', 'Diesen Code gibt es nicht.');
  end if;

  select * into v_code from public.pro_codes
   where code_hash = public.pro_code_hash(v_norm) for update;
  if not found then
    return jsonb_build_object('ok', false, 'fehler', 'Diesen Code gibt es nicht.');
  end if;
  if v_code.gueltig_bis is not null and v_code.gueltig_bis < now() then
    return jsonb_build_object('ok', false, 'fehler', 'Dieser Code ist abgelaufen.');
  end if;
  if exists (select 1 from public.pro_code_einloesungen where code_id = v_code.id and user_id = v_me) then
    return jsonb_build_object('ok', false, 'fehler', 'Diesen Code hast du schon eingelöst.');
  end if;
  if v_code.eingeloest >= v_code.max_einloesungen then
    return jsonb_build_object('ok', false, 'fehler', 'Dieser Code ist schon aufgebraucht.');
  end if;

  insert into public.pro_code_einloesungen (code_id, user_id) values (v_code.id, v_me);
  update public.pro_codes set eingeloest = eingeloest + 1 where id = v_code.id;

  -- Laeuft schon PRO, haengen die Tage hinten an. Ein gekauftes PRO ohne Ende
  -- bleibt ohne Ende - ein Geschenk darf nichts verkuerzen.
  update public.profiles p set
    plan = case when p.plan = 'pro' then 'pro' else 'gifted' end,
    plan_expires_at = case
      when p.plan in ('pro', 'gifted') and p.plan_expires_at is null then null
      else greatest(coalesce(p.plan_expires_at, now()), now()) + make_interval(days => v_code.tage)
    end
  where p.id = v_me
  returning plan_expires_at into v_bis;

  return jsonb_build_object('ok', true, 'tage', v_code.tage, 'bis', v_bis);
end
$fn$;
revoke execute on function public.pro_code_einloesen(text) from anon;
grant execute on function public.pro_code_einloesen(text) to authenticated;

-- --- Beitragstext bis 1500 -----------------------------------------------------------
do $$
declare v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.posts'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%length(body)%'
  loop
    execute format('alter table public.posts drop constraint %I', v_name);
  end loop;
end $$;
alter table public.posts add constraint posts_body_laenge check (length(body) <= 1500);

-- --- Anpinnen --------------------------------------------------------------------------
alter table public.posts add column if not exists angepinnt_am timestamptz;
create index if not exists posts_angepinnt_idx on public.posts (user_id) where angepinnt_am is not null;

create or replace function public.post_anpinnen(p_post uuid, p_an boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  v_grenze int;
  v_schon  int;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if not exists (select 1 from public.posts where id = p_post and user_id = v_me and status = 'visible') then
    raise exception 'Nur eigene Beiträge lassen sich anpinnen';
  end if;

  if not coalesce(p_an, false) then
    update public.posts set angepinnt_am = null where id = p_post;
    return jsonb_build_object('angepinnt', false);
  end if;

  v_grenze := case when public.ist_pro(v_me) then 3 else 1 end;
  select count(*) into v_schon from public.posts
   where user_id = v_me and status = 'visible' and angepinnt_am is not null and id <> p_post;
  if v_schon >= v_grenze then
    if v_grenze = 1 then
      raise exception 'PRO:Mehr als einen Beitrag anpinnen geht mit PRO – bis zu drei.';
    end if;
    raise exception 'Höchstens drei angepinnte Beiträge. Löse zuerst einen.';
  end if;

  update public.posts set angepinnt_am = now() where id = p_post;
  return jsonb_build_object('angepinnt', true);
end
$fn$;
revoke execute on function public.post_anpinnen(uuid, boolean) from anon;
grant execute on function public.post_anpinnen(uuid, boolean) to authenticated;

-- --- Profilbild: PRO-Stile und -Gruende --------------------------------------------------
-- Format v2 (0089): v2-<grund><farbe1><farbe2><stil>-<hex>. Stil ab Index 4
-- (Metall, Glas) und Grund ab Index 8 sind PRO.
create or replace function public.avatar_braucht_pro(p_seed text)
returns boolean
language sql immutable set search_path = ''
as $fn$
  select coalesce(p_seed ~ '^v2-[0-9a-z]{4}-[0-9a-f]{19}$', false)
     and (position(substr(p_seed, 4, 1) in '0123456789abcdefghijklmnopqrstuvwxyz') - 1 >= 8
          or position(substr(p_seed, 7, 1) in '0123456789abcdefghijklmnopqrstuvwxyz') - 1 >= 4);
$fn$;

-- Als Trigger, nicht in update_my_settings: der Client darf avatar_seed auch
-- DIREKT schreiben (Spaltenrecht aus 0002). Eine Pruefung nur in der Funktion
-- liesse sich umgehen. Ohne PRO bleibt das bisherige Bild stehen.
create or replace function public.profiles_avatar_pro()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.avatar_seed is distinct from old.avatar_seed
     and public.avatar_braucht_pro(new.avatar_seed)
     and not public.ist_pro(new.id) then
    new.avatar_seed := old.avatar_seed;
  end if;
  return new;
end
$fn$;
drop trigger if exists profiles_avatar_pro on public.profiles;
create trigger profiles_avatar_pro before update of avatar_seed on public.profiles
  for each row execute function public.profiles_avatar_pro();

-- --- create_post (vollstaendig aus 0090) -----------------------------------------------
create or replace function public.create_post(
  p_body       text,
  p_art        text default 'post',
  p_content_id uuid default null,
  p_repost_of  uuid default null,
  p_daten      jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me      uuid := auth.uid();
  v_body    text := public.absaetze_saeubern(p_body);
  v_art     text := coalesce(p_art, 'post');
  v_ziel    uuid := p_repost_of;
  v_daten   jsonb := '{}'::jsonb;
  v_pruef   text;
  v_richtig int;
  v_n       int;
  v_ok      int;
  v_reject  text;
  v_id      uuid;
  v_heute   int;
  v_pro     boolean := public.ist_pro(auth.uid());
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if v_art not in ('post', 'frage', 'umfrage', 'quiz', 'stapel', 'lab') then
    raise exception 'Unbekannte Beitragsart';
  end if;
  if p_repost_of is not null and v_art <> 'post' then raise exception 'Teilen geht nur als Beitrag'; end if;
  -- 0091: PRO-Grenzen. Meldungen mit "PRO:" am Anfang oeffnen im Client das
  -- PRO-Fenster statt einer Fehlerzeile.
  if length(v_body) > 1500 then raise exception 'Höchstens 1500 Zeichen'; end if;
  if length(v_body) > 500 and not v_pro then
    raise exception 'PRO:Mehr als 500 Zeichen gibt es mit PRO – bis zu 1500.';
  end if;
  if length(v_body) < 2 and p_content_id is null and p_repost_of is null
     and v_art not in ('stapel', 'lab') then
    raise exception 'Schreib mindestens zwei Zeichen';
  end if;
  v_pruef := v_body;

  -- --- Einzelheiten je Art -------------------------------------------------
  if v_art in ('umfrage', 'quiz') then
    if jsonb_typeof(p_daten->'optionen') is distinct from 'array' then
      raise exception 'Antworten fehlen';
    end if;
    v_n := jsonb_array_length(p_daten->'optionen');
    if v_art = 'umfrage' and (v_n < 2 or v_n > 6) then raise exception 'Zwei bis sechs Antworten'; end if;
    if v_art = 'umfrage' and v_n > 4 and not v_pro then
      raise exception 'PRO:Mehr als vier Antworten gibt es mit PRO – bis zu sechs.';
    end if;
    if v_art = 'quiz' and (v_n < 3 or v_n > 4) then raise exception 'Drei oder vier Antworten'; end if;
    if v_art = 'quiz' and v_n = 4 and not v_pro then
      raise exception 'PRO:Eine vierte Antwort im Quiz gibt es mit PRO.';
    end if;

    select count(*) filter (where length(btrim(x)) between 1 and 80),
           jsonb_agg(btrim(x) order by i),
           string_agg(btrim(x), E'
')
      into v_ok, v_daten, v_pruef
      from jsonb_array_elements_text(p_daten->'optionen') with ordinality as t(x, i);
    if v_ok <> v_n then raise exception 'Jede Antwort 1 bis 80 Zeichen'; end if;
    -- 0090: Zeilenumbruch statt Leerzeichen - sonst verschmelzen Antworten wie
    -- "1990" und "2000" in der Pruefung zu einer langen Ziffernfolge.
    v_pruef := v_body || E'
' || v_pruef;
    v_daten := jsonb_build_object('optionen', v_daten);

    if v_art = 'quiz' then
      v_richtig := case when (p_daten->>'richtig') ~ '^[0-9]+$' then (p_daten->>'richtig')::int end;
      if v_richtig is null or v_richtig >= v_n then raise exception 'Markiere die richtige Antwort'; end if;
    end if;

  elsif v_art = 'stapel' then
    if jsonb_typeof(p_daten->'karten') is distinct from 'array' then raise exception 'Karten fehlen'; end if;
    v_n := jsonb_array_length(p_daten->'karten');
    if v_n < 2 or v_n > 50 then raise exception 'Zwei bis fünfzig Karten'; end if;
    if v_n > 10 and not v_pro then
      raise exception 'PRO:Mehr als zehn Karten im Stapel gibt es mit PRO – bis zu 50.';
    end if;
    -- Vergleich als Text: eine kaputte Kennung soll "gibt es nicht" heissen,
    -- nicht mit einem Typfehler abbrechen.
    select count(distinct ci.id) into v_ok
      from jsonb_array_elements_text(p_daten->'karten') as t(x)
      join public.content_items ci on ci.id::text = t.x and ci.status = 'approved';
    if v_ok <> v_n then raise exception 'Eine Karte gibt es nicht mehr – oder sie ist doppelt'; end if;
    v_daten := jsonb_build_object('karten', p_daten->'karten');

  elsif v_art = 'lab' then
    if coalesce(p_daten->>'werkzeug', '') not in
       ('zinseszins', 'geburtstag', 'reaktion', 'anker', 'schlaf', 'lesetempo', 'licht') then
      raise exception 'Unbekanntes LAB-Werkzeug';
    end if;
    if jsonb_typeof(p_daten->'eingaben') is distinct from 'object'
       or length((p_daten->'eingaben')::text) > 1500 then
      raise exception 'LAB-Eingaben ungültig';
    end if;
    v_daten := jsonb_build_object('werkzeug', p_daten->>'werkzeug', 'eingaben', p_daten->'eingaben');
  end if;

  if p_content_id is not null and not exists (
    select 1 from public.content_items where id = p_content_id and status = 'approved'
  ) then
    raise exception 'Diese Karte gibt es nicht mehr';
  end if;

  if p_repost_of is not null then
    if not public.post_sichtbar(p_repost_of, v_me) then
      raise exception 'Diesen Beitrag gibt es nicht mehr';
    end if;
    -- Ein Repost eines reinen Reposts zeigt auf das Original. Sonst stapeln
    -- sich leere Huellen, und der eigentliche Text rutscht immer tiefer.
    select case when length(o.body) = 0 and o.repost_of is not null then o.repost_of else o.id end
      into v_ziel
      from public.posts o where o.id = p_repost_of;
  end if;

  select count(*) into v_heute
    from public.posts where user_id = v_me and created_at > now() - interval '24 hours';
  if v_heute >= 30 then
    raise exception 'Genug für heute: höchstens 30 Beiträge am Tag';
  end if;

  -- Antworten von Umfrage und Quiz gehen durch dieselbe Pruefung wie der Text.
  if length(btrim(coalesce(v_pruef, ''))) > 0 then
    v_reject := public.post_rejection(v_pruef);
  end if;

  insert into public.posts (user_id, art, body, content_id, repost_of, daten, status, block_reason)
  values (v_me, v_art, v_body, p_content_id, v_ziel, v_daten,
          case when v_reject is null then 'visible' else 'blocked' end, v_reject)
  returning id into v_id;

  if v_art = 'quiz' then
    insert into public.post_quiz_loesung (post_id, richtig) values (v_id, v_richtig);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_reject is null then 'visible' else 'blocked' end,
    'reason', v_reject);
end
$fn$;
grant execute on function public.create_post(text, text, uuid, uuid, jsonb) to authenticated;

-- --- post_json (vollstaendig aus 0088) -------------------------------------------------
create or replace function public.post_json(p_id uuid, p_me uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'id',   p.id,
    'art',  p.art,
    'body', p.body,
    'at',   p.created_at,
    'wer',  jsonb_build_object(
              'handle', a.handle,
              'name', coalesce(nullif(trim(a.display_name), ''), a.handle),
              'avatar_seed', a.avatar_seed, 'avatar_path', a.avatar_path,
              'ich', a.id = p_me,
              'pro', public.ist_pro(a.id)),
    -- 0091: im Profil oben angepinnt
    'angepinnt', p.angepinnt_am is not null,
    'ist_meins',  p.user_id = p_me,
    'likes',      (select count(*) from public.post_likes l where l.post_id = p.id),
    'ich_like',   exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_me),
    'kommentare', (select count(*) from public.post_comments c where c.post_id = p.id and c.status = 'visible'),
    'reposts',    (select count(*) from public.posts r where r.repost_of = p.id and r.status = 'visible'),
    'daten',      public.post_daten_json(p.id, p_me),
    'karte', case when ci.id is null then null else jsonb_build_object(
               'content_id', ci.id, 'title', ci.title, 'deck', ci.deck,
               'category', ci.primary_category_id) end,
    'original', case when o.id is null then null else jsonb_build_object(
               'id', o.id, 'art', o.art, 'body', o.body, 'at', o.created_at,
               'daten', public.post_daten_json(o.id, p_me),
               'wer', jsonb_build_object(
                        'handle', oa.handle,
                        'name', coalesce(nullif(trim(oa.display_name), ''), oa.handle),
                        'avatar_seed', oa.avatar_seed, 'avatar_path', oa.avatar_path,
                        'ich', oa.id = p_me),
               'karte', case when oci.id is null then null else jsonb_build_object(
                          'content_id', oci.id, 'title', oci.title, 'deck', oci.deck,
                          'category', oci.primary_category_id) end) end
  )
    from public.posts p
    join public.profiles a on a.id = p.user_id
    left join public.content_items ci  on ci.id = p.content_id and ci.status = 'approved'
    left join public.posts o           on o.id = p.repost_of and o.status = 'visible'
    left join public.profiles oa       on oa.id = o.user_id
    left join public.content_items oci on oci.id = o.content_id and oci.status = 'approved'
   where p.id = p_id;
$fn$;

-- --- get_user_posts (vollstaendig aus 0084) --------------------------------------------
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
    -- 0091: Angepinnte zuerst, und nur auf der ersten Seite. Danach die
    -- uebrigen nach Zeit - p_before bezieht sich nur auf diese, sonst kaeme ein
    -- alter angepinnter Beitrag beim Weiterblaettern ein zweites Mal.
    'posts', coalesce((
      select jsonb_agg(public.post_json(x.id, v_me) order by x.rang, x.sortier desc)
        from (
          select id, 0 as rang, angepinnt_am as sortier from public.posts
           where user_id = v_user and status = 'visible'
             and angepinnt_am is not null and p_before is null
          union all
          select id, 1, created_at from (
            select id, created_at from public.posts
             where user_id = v_user and status = 'visible' and angepinnt_am is null
               and created_at < coalesce(p_before, 'infinity'::timestamptz)
             order by created_at desc
             limit least(greatest(coalesce(p_limit, 10), 1), 50)
          ) z
        ) x
    ), '[]'::jsonb));
end
$fn$;
grant execute on function public.get_user_posts(text, int, timestamptz) to authenticated;

-- --- get_public_profile (vollstaendig aus 0083) ----------------------------------------
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
  v_j   jsonb;
  v_alt text;
begin
  select id, avatar_seed into v_id, v_alt from public.profiles where plan = 'free' order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest PRO: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);

  begin
    if public.ist_pro(v_id) then raise exception 'Selbsttest: freies Konto gilt als PRO'; end if;
    if not public.avatar_braucht_pro('v2-8000-0000000000000000000') then raise exception 'Selbsttest: PRO-Grund nicht erkannt'; end if;
    if not public.avatar_braucht_pro('v2-0004-0000000000000000000') then raise exception 'Selbsttest: PRO-Stil nicht erkannt'; end if;
    if public.avatar_braucht_pro('v2-7bb3-0000000000000000000') then raise exception 'Selbsttest: freier Stil als PRO erkannt'; end if;

    -- Ohne PRO: PRO-Profilbild wird nicht uebernommen
    update public.profiles set avatar_seed = 'v2-8004-0000000000000000000' where id = v_id;
    if (select avatar_seed from public.profiles where id = v_id) is distinct from v_alt then
      raise exception 'Selbsttest: PRO-Profilbild ohne PRO gespeichert';
    end if;

    insert into public.pro_codes (code_hash, tage) values (public.pro_code_hash('test-code-0091'), 7);
    v_j := public.pro_code_einloesen('TEST CODE 0091');
    if not (v_j->>'ok')::boolean then raise exception 'Selbsttest: Code nicht eingeloest: %', v_j; end if;
    if not public.ist_pro(v_id) then raise exception 'Selbsttest: nach Code kein PRO'; end if;
    v_j := public.pro_code_einloesen('test-code-0091');
    if (v_j->>'ok')::boolean then raise exception 'Selbsttest: Code zweimal eingeloest'; end if;
    v_j := public.pro_code_einloesen('GIBTESNICHT99');
    if (v_j->>'ok')::boolean then raise exception 'Selbsttest: falscher Code angenommen'; end if;

    -- Mit PRO: jetzt geht es
    update public.profiles set avatar_seed = 'v2-8004-0000000000000000000' where id = v_id;
    if (select avatar_seed from public.profiles where id = v_id) <> 'v2-8004-0000000000000000000' then
      raise exception 'Selbsttest: PRO-Profilbild mit PRO nicht gespeichert';
    end if;

    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest PRO: ok';
end
$test$;

notify pgrst, 'reload schema';
