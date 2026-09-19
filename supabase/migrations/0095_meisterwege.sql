-- =============================================================================
-- 0095_meisterwege.sql  ·  Meisterwege: Stufen je Hauptthema, nur durch Lernen
--
-- Entschieden am 18.09.2026: KEIN "Battlepass", nichts zu kaufen, kein
-- Zeitdruck. Die Stufe rechnet der Server aus user_categories.mastery_score
-- (das schreibt nur award_xp) - der Client kann sie weder setzen noch
-- beschleunigen. PRO bekommt je Meisterweg EINE Zusatzvariante (Goldrahmen),
-- nie schnelleren Fortschritt.
--
-- Stufen (Mastery je Hauptthema, Summe ueber alle Unterkategorien, wie in
-- get_category_detail): 50 / 150 / 400 / 800 / 1500. Eine richtige Antwort
-- bringt 10 Mastery - Stufe 2 heisst also rund 15 richtige Antworten in
-- einem Thema, Stufe 5 rund 150.
--
-- Belohnungen je Hauptthema:
--   Stufe 2  Rahmen ums Profilbild (eigener Name je Thema) + Goldvariante mit PRO
--   Stufe 3  Namensfarbe (kleine, lesbare Palette aus Design 2.0)
--   Stufe 4  heller Profilbild-Grund (Elfenbein, Champagner, Sand)
--   Stufe 5  dunkle Wabenfarbe (Obsidian, Anthrazit, Tiefgruen, Nachtblau, Schwarzgold)
-- Mehrere Themen teilen sich Farben; freigeschaltet ist eine Farbe, sobald
-- EIN Thema, das sie vergibt, die Stufe erreicht hat.
--
-- Profilbild: die neuen Gruende haengen als Index 12-14 an WABEN_GRUENDE,
-- die neuen Farben als 12-16 an WABEN_FARBEN (lib/avatarWaben.ts). Die
-- PRO-Gruende bleiben 8-11 - avatar_braucht_pro zaehlte bisher ">= 8" und
-- haette die Meister-Gruende faelschlich zu PRO gemacht; deshalb neu.
--
-- Vollstaendig uebernommen: post_json und get_public_profile (0091),
-- avatar_braucht_pro und profiles_avatar_pro (0091).
-- =============================================================================

-- --- Stufen ---------------------------------------------------------------------------
create or replace function public.meister_stufe(p_mastery int)
returns int
language sql immutable set search_path = ''
as $fn$
  select case
    when coalesce(p_mastery, 0) >= 1500 then 5
    when p_mastery >= 800 then 4
    when p_mastery >= 400 then 3
    when p_mastery >= 150 then 2
    when p_mastery >= 50  then 1
    else 0 end;
$fn$;

create or replace function public.meister_schwelle(p_stufe int)
returns int
language sql immutable set search_path = ''
as $fn$
  select (array[50, 150, 400, 800, 1500])[p_stufe];
$fn$;

-- Mastery je Hauptthema. Die Wurzel ist der Teil vor dem ersten Punkt - so
-- liest auch arrange.ts die Themen (0082 hat Blaetter deshalb VERSCHOBEN,
-- nicht nur umgehaengt).
create or replace function public.meister_mastery(p_user uuid)
returns table (wurzel text, mastery int)
language sql stable security definer set search_path = ''
as $fn$
  select split_part(uc.category_id, '.', 1), coalesce(sum(uc.mastery_score), 0)::int
    from public.user_categories uc
   where uc.user_id = p_user
   group by 1;
$fn$;
revoke execute on function public.meister_mastery(uuid) from anon, authenticated;

-- --- Belohnungen ---------------------------------------------------------------------
create table if not exists public.meister_belohnungen (
  id      text primary key,                 -- '<wurzel>:<art>' bzw. '<wurzel>:rahmen-gold'
  wurzel  text not null references public.categories(id) on delete cascade,
  stufe   int  not null check (stufe between 1 and 5),
  art     text not null check (art in ('rahmen', 'name', 'grund', 'farbe')),
  wert    text not null,                    -- Rahmen-Code, Farbe als Hex, Index im Profilbild
  titel   text not null,
  pro     boolean not null default false
);
alter table public.meister_belohnungen enable row level security;
revoke all on public.meister_belohnungen from anon, authenticated;
grant select on public.meister_belohnungen to authenticated;
drop policy if exists meister_belohnungen_lesen on public.meister_belohnungen;
create policy meister_belohnungen_lesen on public.meister_belohnungen for select to authenticated using (true);

insert into public.meister_belohnungen (id, wurzel, stufe, art, wert, titel, pro) values
  -- Rahmen (Stufe 2) und Goldvariante (Stufe 2 + PRO)
  ('science:rahmen',       'science',  2, 'rahmen', 'science',       'Laborglas',     false),
  ('science:rahmen-gold',  'science',  2, 'rahmen', 'science-gold',  'Laborglas Gold', true),
  ('tech:rahmen',          'tech',     2, 'rahmen', 'tech',          'Schaltkreis',   false),
  ('tech:rahmen-gold',     'tech',     2, 'rahmen', 'tech-gold',     'Schaltkreis Gold', true),
  ('finance:rahmen',       'finance',  2, 'rahmen', 'finance',       'Münzrand',      false),
  ('finance:rahmen-gold',  'finance',  2, 'rahmen', 'finance-gold',  'Münzrand Gold', true),
  ('body:rahmen',          'body',     2, 'rahmen', 'body',          'Puls',          false),
  ('body:rahmen-gold',     'body',     2, 'rahmen', 'body-gold',     'Puls Gold',     true),
  ('mind:rahmen',          'mind',     2, 'rahmen', 'mind',          'Synapse',       false),
  ('mind:rahmen-gold',     'mind',     2, 'rahmen', 'mind-gold',     'Synapse Gold',  true),
  ('world:rahmen',         'world',    2, 'rahmen', 'world',         'Meridian',      false),
  ('world:rahmen-gold',    'world',    2, 'rahmen', 'world-gold',    'Meridian Gold', true),
  ('local:rahmen',         'local',    2, 'rahmen', 'local',         'Heimat',        false),
  ('local:rahmen-gold',    'local',    2, 'rahmen', 'local-gold',    'Heimat Gold',   true),
  ('life:rahmen',          'life',     2, 'rahmen', 'life',          'Paragraf',      false),
  ('life:rahmen-gold',     'life',     2, 'rahmen', 'life-gold',     'Paragraf Gold', true),
  ('history:rahmen',       'history',  2, 'rahmen', 'history',       'Säule',         false),
  ('history:rahmen-gold',  'history',  2, 'rahmen', 'history-gold',  'Säule Gold',    true),
  ('culture:rahmen',       'culture',  2, 'rahmen', 'culture',       'Pinselstrich',  false),
  ('culture:rahmen-gold',  'culture',  2, 'rahmen', 'culture-gold',  'Pinselstrich Gold', true),
  ('language:rahmen',      'language', 2, 'rahmen', 'language',      'Feder',         false),
  ('language:rahmen-gold', 'language', 2, 'rahmen', 'language-gold', 'Feder Gold',    true),
  -- Namensfarben (Stufe 3)
  ('finance:name',  'finance',  3, 'name', '#D9B872', 'Gold',       false),
  ('history:name',  'history',  3, 'name', '#D9B872', 'Gold',       false),
  ('culture:name',  'culture',  3, 'name', '#E8D3A2', 'Champagner', false),
  ('life:name',     'life',     3, 'name', '#E8D3A2', 'Champagner', false),
  ('mind:name',     'mind',     3, 'name', '#E39AA8', 'Rose',       false),
  ('body:name',     'body',     3, 'name', '#E39AA8', 'Rose',       false),
  ('science:name',  'science',  3, 'name', '#8FBF9A', 'Salbei',     false),
  ('local:name',    'local',    3, 'name', '#8FBF9A', 'Salbei',     false),
  ('tech:name',     'tech',     3, 'name', '#9FB4EE', 'Saphir',     false),
  ('world:name',    'world',    3, 'name', '#9FB4EE', 'Saphir',     false),
  ('language:name', 'language', 3, 'name', '#7FC4C9', 'Petrol',     false),
  -- Helle Gruende (Stufe 4), Index in WABEN_GRUENDE
  ('science:grund',  'science',  4, 'grund', '12', 'Elfenbein',  false),
  ('language:grund', 'language', 4, 'grund', '12', 'Elfenbein',  false),
  ('culture:grund',  'culture',  4, 'grund', '12', 'Elfenbein',  false),
  ('mind:grund',     'mind',     4, 'grund', '12', 'Elfenbein',  false),
  ('finance:grund',  'finance',  4, 'grund', '13', 'Champagner', false),
  ('history:grund',  'history',  4, 'grund', '13', 'Champagner', false),
  ('life:grund',     'life',     4, 'grund', '13', 'Champagner', false),
  ('local:grund',    'local',    4, 'grund', '13', 'Champagner', false),
  ('tech:grund',     'tech',     4, 'grund', '14', 'Sand',       false),
  ('body:grund',     'body',     4, 'grund', '14', 'Sand',       false),
  ('world:grund',    'world',    4, 'grund', '14', 'Sand',       false),
  -- Dunkle Wabenfarben (Stufe 5), Index in WABEN_FARBEN
  ('tech:farbe',     'tech',     5, 'farbe', '12', 'Obsidian',    false),
  ('mind:farbe',     'mind',     5, 'farbe', '12', 'Obsidian',    false),
  ('world:farbe',    'world',    5, 'farbe', '13', 'Anthrazit',   false),
  ('local:farbe',    'local',    5, 'farbe', '13', 'Anthrazit',   false),
  ('life:farbe',     'life',     5, 'farbe', '13', 'Anthrazit',   false),
  ('science:farbe',  'science',  5, 'farbe', '14', 'Tiefgrün',    false),
  ('body:farbe',     'body',     5, 'farbe', '14', 'Tiefgrün',    false),
  ('language:farbe', 'language', 5, 'farbe', '15', 'Nachtblau',   false),
  ('culture:farbe',  'culture',  5, 'farbe', '15', 'Nachtblau',   false),
  ('finance:farbe',  'finance',  5, 'farbe', '16', 'Schwarzgold', false),
  ('history:farbe',  'history',  5, 'farbe', '16', 'Schwarzgold', false)
on conflict (id) do update set
  wurzel = excluded.wurzel, stufe = excluded.stufe, art = excluded.art,
  wert = excluded.wert, titel = excluded.titel, pro = excluded.pro;

-- Was ist fuer diese Person frei? art + wert, damit geteilte Farben einmal zaehlen.
create or replace function public.meister_frei(p_user uuid)
returns table (art text, wert text)
language sql stable security definer set search_path = ''
as $fn$
  select distinct b.art, b.wert
    from public.meister_belohnungen b
    join public.meister_mastery(p_user) m on m.wurzel = b.wurzel
   where public.meister_stufe(m.mastery) >= b.stufe
     and (not b.pro or public.ist_pro(p_user));
$fn$;
revoke execute on function public.meister_frei(uuid) from anon, authenticated;

-- --- Auswahl: Rahmen und Namensfarbe ---------------------------------------------------
-- Nur ueber diese Funktion, KEIN Spaltenrecht: sonst koennte der Client jede
-- Farbe direkt schreiben (wie beim Profilbild, das deshalb einen Trigger hat).
alter table public.profiles add column if not exists rahmen text;
alter table public.profiles add column if not exists namensfarbe text;

create or replace function public.meister_waehlen(p_rahmen text, p_namensfarbe text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if p_rahmen is not null and not exists (
    select 1 from public.meister_frei(v_me) f where f.art = 'rahmen' and f.wert = p_rahmen
  ) then
    raise exception 'Diesen Rahmen hast du noch nicht freigespielt';
  end if;
  if p_namensfarbe is not null and not exists (
    select 1 from public.meister_frei(v_me) f where f.art = 'name' and f.wert = p_namensfarbe
  ) then
    raise exception 'Diese Namensfarbe hast du noch nicht freigespielt';
  end if;
  update public.profiles set rahmen = p_rahmen, namensfarbe = p_namensfarbe where id = v_me;
  return jsonb_build_object('rahmen', p_rahmen, 'namensfarbe', p_namensfarbe);
end
$fn$;
revoke execute on function public.meister_waehlen(text, text) from anon;
grant execute on function public.meister_waehlen(text, text) to authenticated;

-- --- Uebersicht fuer die App -----------------------------------------------------------
create or replace function public.meisterwege()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with m as (select * from public.meister_mastery(auth.uid())),
       frei as (select * from public.meister_frei(auth.uid()))
  select jsonb_build_object(
    'rahmen',      (select rahmen from public.profiles where id = auth.uid()),
    'namensfarbe', (select namensfarbe from public.profiles where id = auth.uid()),
    'wege', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.display_name, 'emoji', c.emoji, 'farbe', c.accent_hex,
               'mastery', coalesce(m.mastery, 0),
               'stufe', public.meister_stufe(coalesce(m.mastery, 0)),
               'naechste', case when public.meister_stufe(coalesce(m.mastery, 0)) >= 5 then null
                                else public.meister_schwelle(public.meister_stufe(coalesce(m.mastery, 0)) + 1) end,
               'belohnungen', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', b.id, 'stufe', b.stufe, 'art', b.art, 'wert', b.wert,
                          'titel', b.titel, 'pro', b.pro,
                          'frei', exists (select 1 from frei f where f.art = b.art and f.wert = b.wert)
                        ) order by b.stufe, b.pro), '[]'::jsonb)
                   from public.meister_belohnungen b where b.wurzel = c.id)
             ) order by c.sort_order)
        from public.categories c
        left join m on m.wurzel = c.id
       where c.parent_id is null and c.is_active
         and exists (select 1 from public.meister_belohnungen b where b.wurzel = c.id)
    ), '[]'::jsonb)
  );
$fn$;
revoke execute on function public.meisterwege() from anon;
grant execute on function public.meisterwege() to authenticated;

-- --- Profilbild: PRO-Gruende 8-11, Meister-Gruende ab 12, Meister-Farben ab 12 ----------
create or replace function public.avatar_braucht_pro(p_seed text)
returns boolean
language sql immutable set search_path = ''
as $fn$
  select coalesce(p_seed ~ '^v2-[0-9a-z]{4}-[0-9a-f]{19}$', false)
     and (position(substr(p_seed, 4, 1) in '0123456789abcdefghijklmnopqrstuvwxyz') - 1 between 8 and 11
          or position(substr(p_seed, 7, 1) in '0123456789abcdefghijklmnopqrstuvwxyz') - 1 >= 4);
$fn$;

create or replace function public.avatar_erlaubt(p_user uuid, p_seed text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_ziffern text := '0123456789abcdefghijklmnopqrstuvwxyz';
  v_grund int;
  v_f1    int;
  v_f2    int;
begin
  if public.avatar_braucht_pro(p_seed) and not public.ist_pro(p_user) then return false; end if;
  if not coalesce(p_seed ~ '^v2-[0-9a-z]{4}-[0-9a-f]{19}$', false) then return true; end if;
  v_grund := position(substr(p_seed, 4, 1) in v_ziffern) - 1;
  v_f1    := position(substr(p_seed, 5, 1) in v_ziffern) - 1;
  v_f2    := position(substr(p_seed, 6, 1) in v_ziffern) - 1;
  if v_grund >= 12 and not exists (
    select 1 from public.meister_frei(p_user) f where f.art = 'grund' and f.wert = v_grund::text
  ) then return false; end if;
  if v_f1 >= 12 and not exists (
    select 1 from public.meister_frei(p_user) f where f.art = 'farbe' and f.wert = v_f1::text
  ) then return false; end if;
  if v_f2 >= 12 and not exists (
    select 1 from public.meister_frei(p_user) f where f.art = 'farbe' and f.wert = v_f2::text
  ) then return false; end if;
  return true;
end
$fn$;
revoke execute on function public.avatar_erlaubt(uuid, text) from anon, authenticated;

-- Trigger (0091) prueft jetzt auch die Meister-Freischaltungen. Wie bei PRO:
-- Nicht Erlaubtes wird still verworfen, das alte Bild bleibt.
create or replace function public.profiles_avatar_pro()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.avatar_seed is distinct from old.avatar_seed
     and not public.avatar_erlaubt(new.id, new.avatar_seed) then
    new.avatar_seed := old.avatar_seed;
  end if;
  return new;
end
$fn$;

-- --- post_json (vollstaendig aus 0091) -------------------------------------------------
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
              'pro', public.ist_pro(a.id),
              -- 0095: Meisterwege
              'rahmen', a.rahmen, 'namensfarbe', a.namensfarbe),
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
                        'ich', oa.id = p_me,
                        'rahmen', oa.rahmen, 'namensfarbe', oa.namensfarbe),
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

-- --- get_public_profile (vollstaendig aus 0091) ----------------------------------------
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
  v_id   uuid;
  v_hdl  text;
  v_alt  text;
  v_j    jsonb;
  v_post uuid;
begin
  select id, handle, avatar_seed into v_id, v_hdl, v_alt from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0095: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);

  begin
    if public.meister_stufe(0) <> 0 or public.meister_stufe(50) <> 1 or public.meister_stufe(1499) <> 4
       or public.meister_stufe(1500) <> 5 then
      raise exception 'Selbsttest 0095: Stufen falsch';
    end if;
    if public.avatar_braucht_pro('v2-c000-0000000000000000000') then
      raise exception 'Selbsttest 0095: Meister-Grund als PRO erkannt';
    end if;
    if not public.avatar_braucht_pro('v2-8000-0000000000000000000') then
      raise exception 'Selbsttest 0095: PRO-Grund nicht mehr erkannt';
    end if;

    v_j := public.meisterwege();
    if jsonb_array_length(v_j->'wege') < 1 then raise exception 'Selbsttest 0095: keine Wege: %', v_j; end if;

    -- Ohne Mastery: nichts frei, Auswahl muss scheitern, Profilbild bleibt.
    delete from public.user_categories where user_id = v_id;
    begin
      perform public.meister_waehlen('science', null);
      raise exception 'Selbsttest 0095: Rahmen ohne Stufe angenommen';
    exception when others then
      if sqlerrm not like 'Diesen Rahmen%' then raise; end if;
    end;
    update public.profiles set avatar_seed = 'v2-c000-0000000000000000000' where id = v_id;
    if (select avatar_seed from public.profiles where id = v_id) is distinct from v_alt then
      raise exception 'Selbsttest 0095: Meister-Grund ohne Stufe gespeichert';
    end if;

    -- Mit Stufe 5 in Wissenschaft: Rahmen, Name, Grund 12 und Farbe 14 gehen.
    insert into public.user_categories (user_id, category_id, mastery_score)
    values (v_id, 'science', 1600);
    v_j := public.meister_waehlen('science', '#8FBF9A');
    update public.profiles set avatar_seed = 'v2-ce00-0000000000000000000' where id = v_id;
    if (select avatar_seed from public.profiles where id = v_id) <> 'v2-ce00-0000000000000000000' then
      raise exception 'Selbsttest 0095: Meister-Profilbild mit Stufe nicht gespeichert';
    end if;

    v_j := public.get_public_profile(v_hdl);
    if v_j->>'rahmen' <> 'science' or jsonb_array_length(v_j->'meister') < 1 then
      raise exception 'Selbsttest 0095: Profil ohne Meisterweg: %', v_j;
    end if;
    select id into v_post from public.posts where user_id = v_id order by created_at desc limit 1;
    if v_post is not null then
      v_j := public.post_json(v_post, v_id);
      if v_j->'wer'->>'namensfarbe' <> '#8FBF9A' then raise exception 'Selbsttest 0095: post_json ohne Namensfarbe'; end if;
    end if;

    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0095: ok';
end
$test$;

notify pgrst, 'reload schema';
