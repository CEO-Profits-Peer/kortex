-- =============================================================================
-- 0088_erstellen.sql  ·  Umfrage, Quiz, Stapel, LAB-Ergebnis
--
-- Entschieden am 14.09.2026: "alle gut, alle rein" - Umfrage, Quiz an
-- Follower, Karten-Stapel, Entwuerfe (die liegen nur auf dem Geraet und
-- brauchen hier nichts). Dazu die LAB-Werkzeuge, deren Ergebnis man teilt.
--
-- Alles bleibt ein Beitrag (posts). Eine eigene Tabelle je Art haette Home,
-- Profil, Explore, Kommentare, Likes, Melden, Erwaehnungen - alles, was an
-- posts haengt - noch einmal gebraucht. Unterschieden wird ueber `art`, die
-- Einzelheiten stehen in `daten`.
--
--   umfrage  daten.optionen  2-4 Antworten. Ergebnis sieht, wer abgestimmt
--                            hat - und wer sie gestellt hat.
--   quiz     daten.optionen  genau 3 Antworten. Die richtige steht NICHT in
--                            daten, sondern in post_quiz_loesung, und kommt
--                            erst nach der eigenen Antwort mit (dieselbe
--                            Regel wie bei Karten). Das eigene Quiz kann man
--                            nicht beantworten.
--   stapel   daten.karten    2-10 freigegebene Karten, in Reihenfolge
--   lab      daten.werkzeug, daten.eingaben
--                            Gespeichert werden nur die EINGABEN. Die App
--                            rechnet das Ergebnis bei jeder Anzeige aus
--                            derselben Formel neu - eine Zahl, die jemand
--                            von Hand in daten schreibt, wird nie angezeigt.
--
-- Ankereffekt (LAB): ein Wert je Person, ausgewertet nur als Schnitt je
-- Gruppe. Einzelne Schaetzungen sieht niemand.
-- =============================================================================


-- --- Tabellen -------------------------------------------------------------------
alter table public.posts drop constraint if exists posts_art_check;
alter table public.posts add constraint posts_art_check
  check (art in ('post', 'frage', 'umfrage', 'quiz', 'stapel', 'lab'));

alter table public.posts add column if not exists daten jsonb not null default '{}'::jsonb;

create table if not exists public.post_quiz_loesung (
  post_id uuid primary key references public.posts(id) on delete cascade,
  richtig smallint not null
);

create table if not exists public.post_stimmen (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  wahl       smallint not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.lab_anker (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  anker      smallint not null check (anker in (10, 65)),
  schaetzung smallint not null check (schaetzung between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.post_quiz_loesung enable row level security;
alter table public.post_stimmen      enable row level security;
alter table public.lab_anker         enable row level security;
revoke all on public.post_quiz_loesung, public.post_stimmen, public.lab_anker from anon, authenticated;


-- --- Was die App zu einer Art zeigt ---------------------------------------------------
create or replace function public.post_daten_json(p_id uuid, p_me uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with p as (
    select po.*,
           exists (select 1 from public.post_stimmen s where s.post_id = po.id and s.user_id = p_me) as abgestimmt
      from public.posts po where po.id = p_id
  ),
  zaehlung as (
    -- Stimmen je Antwort, auch fuer Antworten ohne Stimme (0).
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by o.i), '[]'::jsonb) as stimmen
      from p
     cross join lateral generate_series(0, greatest(jsonb_array_length(coalesce(p.daten->'optionen', '[]'::jsonb)) - 1, -1)) as o(i)
      left join (select s.wahl, count(*) as n from public.post_stimmen s where s.post_id = p_id group by s.wahl) c
             on c.wahl = o.i
  )
  select case p.art
    when 'umfrage' then jsonb_build_object(
      'optionen',   p.daten->'optionen',
      'meine_wahl', (select s.wahl from public.post_stimmen s where s.post_id = p.id and s.user_id = p_me),
      'gesamt',     (select count(*) from public.post_stimmen s where s.post_id = p.id),
      'stimmen',    case when p.abgestimmt or p.user_id = p_me then (select stimmen from zaehlung) end)
    when 'quiz' then jsonb_build_object(
      'optionen',   p.daten->'optionen',
      'meine_wahl', (select s.wahl from public.post_stimmen s where s.post_id = p.id and s.user_id = p_me),
      'gesamt',     (select count(*) from public.post_stimmen s where s.post_id = p.id),
      'richtig',    case when p.abgestimmt or p.user_id = p_me
                         then (select l.richtig from public.post_quiz_loesung l where l.post_id = p.id) end,
      'stimmen',    case when p.abgestimmt or p.user_id = p_me then (select stimmen from zaehlung) end)
    when 'stapel' then jsonb_build_object(
      'karten', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'content_id', ci.id, 'title', ci.title, 'deck', ci.deck,
                 'category', ci.primary_category_id) order by k.ord), '[]'::jsonb)
          from jsonb_array_elements_text(coalesce(p.daten->'karten', '[]'::jsonb)) with ordinality as k(id, ord)
          join public.content_items ci on ci.id::text = k.id and ci.status = 'approved'))
    when 'lab' then jsonb_build_object('werkzeug', p.daten->>'werkzeug', 'eingaben', p.daten->'eingaben')
    else null
  end
  from p;
$fn$;
revoke execute on function public.post_daten_json(uuid, uuid) from anon, authenticated;


-- --- Beitrag als JSON (vollstaendig aus 0077, `daten` dazu) -------------------------------
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
              'ich', a.id = p_me),
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
revoke execute on function public.post_json(uuid, uuid) from anon, authenticated;


-- --- Beitrag schreiben (vollstaendig aus 0080, neue Arten und p_daten) --------------------
-- Neue Signatur: drop + create, sonst sieht PostgREST zwei create_post.
drop function if exists public.create_post(text, text, uuid, uuid);

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
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if v_art not in ('post', 'frage', 'umfrage', 'quiz', 'stapel', 'lab') then
    raise exception 'Unbekannte Beitragsart';
  end if;
  if p_repost_of is not null and v_art <> 'post' then raise exception 'Teilen geht nur als Beitrag'; end if;
  if length(v_body) > 500 then raise exception 'Höchstens 500 Zeichen'; end if;
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
    if v_art = 'umfrage' and (v_n < 2 or v_n > 4) then raise exception 'Zwei bis vier Antworten'; end if;
    if v_art = 'quiz' and v_n <> 3 then raise exception 'Genau drei Antworten'; end if;

    select count(*) filter (where length(btrim(x)) between 1 and 80),
           jsonb_agg(btrim(x) order by i),
           string_agg(btrim(x), ' ')
      into v_ok, v_daten, v_pruef
      from jsonb_array_elements_text(p_daten->'optionen') with ordinality as t(x, i);
    if v_ok <> v_n then raise exception 'Jede Antwort 1 bis 80 Zeichen'; end if;
    v_pruef := v_body || ' ' || v_pruef;
    v_daten := jsonb_build_object('optionen', v_daten);

    if v_art = 'quiz' then
      v_richtig := case when (p_daten->>'richtig') ~ '^[0-9]+$' then (p_daten->>'richtig')::int end;
      if v_richtig is null or v_richtig >= v_n then raise exception 'Markiere die richtige Antwort'; end if;
    end if;

  elsif v_art = 'stapel' then
    if jsonb_typeof(p_daten->'karten') is distinct from 'array' then raise exception 'Karten fehlen'; end if;
    v_n := jsonb_array_length(p_daten->'karten');
    if v_n < 2 or v_n > 10 then raise exception 'Zwei bis zehn Karten'; end if;
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


-- --- Abstimmen / Quiz beantworten ------------------------------------------------------------
create or replace function public.post_abstimmen(p_post uuid, p_wahl int)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_art   text;
  v_autor uuid;
  v_n     int;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  select art, user_id, jsonb_array_length(coalesce(daten->'optionen', '[]'::jsonb))
    into v_art, v_autor, v_n
    from public.posts where id = p_post and status = 'visible';
  if v_art is null or not public.post_sichtbar(p_post, v_me) then
    raise exception 'Beitrag nicht sichtbar';
  end if;
  if v_art not in ('umfrage', 'quiz') then raise exception 'Hier gibt es nichts abzustimmen'; end if;
  if v_art = 'quiz' and v_autor = v_me then
    raise exception 'Dein eigenes Quiz kannst du nicht beantworten';
  end if;
  if p_wahl is null or p_wahl < 0 or p_wahl >= v_n then raise exception 'Unbekannte Antwort'; end if;

  -- Eine Stimme, kein Umentscheiden: beim Quiz waere Umentscheiden nach der
  -- Aufloesung Schummeln, bei der Umfrage waere das Ergebnis nie fest.
  insert into public.post_stimmen (post_id, user_id, wahl) values (p_post, v_me, p_wahl)
  on conflict do nothing;

  return public.post_daten_json(p_post, v_me);
end
$fn$;
grant execute on function public.post_abstimmen(uuid, int) to authenticated;


-- --- LAB: Ankereffekt -------------------------------------------------------------------------
create or replace function public.lab_anker_eintragen(p_anker int, p_schaetzung int)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if p_anker not in (10, 65) or p_schaetzung is null or p_schaetzung not between 0 and 100 then
    raise exception 'Ungültige Eingabe';
  end if;

  insert into public.lab_anker (user_id, anker, schaetzung) values (v_me, p_anker, p_schaetzung)
  on conflict (user_id) do update
    set anker = excluded.anker, schaetzung = excluded.schaetzung, created_at = now();

  return (
    select jsonb_build_object(
      'niedrig', jsonb_build_object('n', count(*) filter (where anker = 10),
                                    'schnitt', round(avg(schaetzung) filter (where anker = 10))),
      'hoch',    jsonb_build_object('n', count(*) filter (where anker = 65),
                                    'schnitt', round(avg(schaetzung) filter (where anker = 65))))
      from public.lab_anker
  );
end
$fn$;
grant execute on function public.lab_anker_eintragen(int, int) to authenticated;


-- --- Selbsttest -----------------------------------------------------------------------------------
-- Legt je Art einen Beitrag an, stimmt ab, liest alles zurueck - und nimmt es
-- am Ende ALLES zurueck (die Ausnahme am Schluss rollt den Block zurueck).
-- Scheitert unterwegs etwas, bricht db push mit genau diesem Fehler ab.
do $test$
declare
  v_a     uuid;
  v_b     uuid;
  v_k1    uuid;
  v_k2    uuid;
  v_r     jsonb;
  v_quiz  uuid;
  v_umf   uuid;
begin
  select id into v_a from public.profiles where onboarding_completed_at is not null order by created_at limit 1;
  select id into v_b from public.profiles where onboarding_completed_at is not null and id <> v_a order by created_at limit 1;
  select id into v_k1 from public.content_items where status = 'approved' order by created_at limit 1;
  select id into v_k2 from public.content_items where status = 'approved' and id <> v_k1 order by created_at limit 1;
  if v_b is null or v_k2 is null then
    raise notice 'Selbsttest 0088: zu wenig Daten - uebersprungen';
    return;
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    v_umf := (public.create_post('Womit lernt ihr?', 'umfrage', null, null,
              '{"optionen":["Karten","Videos","Bücher"]}'::jsonb)->>'id')::uuid;
    v_quiz := (public.create_post('Wie viele Beine hat eine Spinne?', 'quiz', null, null,
              '{"optionen":["6","8","10"],"richtig":1}'::jsonb)->>'id')::uuid;
    perform public.create_post('', 'stapel', null, null,
              jsonb_build_object('karten', jsonb_build_array(v_k1, v_k2)));
    perform public.create_post('', 'lab', null, null,
              '{"werkzeug":"zinseszins","eingaben":{"start":0,"monatlich":50,"rendite":7,"jahre":49}}'::jsonb);

    -- Der Autor sieht die Loesung seines Quiz ...
    v_r := public.post_daten_json(v_quiz, v_a);
    if (v_r->>'richtig')::int is distinct from 1 then raise exception 'Autor sieht die Quiz-Loesung nicht: %', v_r; end if;

    -- ... jemand anders erst nach der Antwort.
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_r := public.post_daten_json(v_quiz, v_b);
    if v_r ? 'richtig' and v_r->'richtig' <> 'null'::jsonb then
      raise exception 'Quiz-Loesung vor der Antwort sichtbar: %', v_r;
    end if;
    v_r := public.post_abstimmen(v_quiz, 2);
    if (v_r->>'richtig')::int is distinct from 1 or (v_r->>'meine_wahl')::int is distinct from 2 then
      raise exception 'Quiz-Antwort falsch zurueckgegeben: %', v_r;
    end if;
    v_r := public.post_abstimmen(v_umf, 0);
    if v_r->'stimmen' <> '[1,0,0]'::jsonb then raise exception 'Umfrage falsch gezaehlt: %', v_r; end if;

    v_r := public.lab_anker_eintragen(65, 40);
    if (v_r->'hoch'->>'n')::int < 1 then raise exception 'Ankereffekt nicht gezaehlt: %', v_r; end if;

    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'Selbsttest 0088: alle Arten angelegt, abgestimmt, zurueckgerollt';
end
$test$;

notify pgrst, 'reload schema';
