-- =============================================================================
-- 0094_lab_daten.sql  ·  Drei neue LAB-Werkzeuge duerfen geteilt werden
--
-- Inflation, Brutto -> Netto und Wege & CO2. Gerechnet wird nur in der App
-- (features/lab/rechnen.ts) mit amtlichen, dort zitierten Tabellen; der
-- Server speichert wie bei den anderen Werkzeugen nur die EINGABEN. Deshalb
-- aendert sich hier nur die Liste der erlaubten Werkzeuge.
--
-- create_post vollstaendig aus 0093 uebernommen (nie aus einem Ausschnitt).
-- =============================================================================

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
    if v_art = 'quiz' and (v_n < 3 or v_n > 5) then raise exception 'Drei bis fünf Antworten'; end if;
    if v_art = 'quiz' and v_n > 3 and not v_pro then
      raise exception 'PRO:Mehr als drei Antworten im Quiz gibt es mit PRO – bis zu fünf.';
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
       ('zinseszins', 'geburtstag', 'reaktion', 'anker', 'schlaf', 'lesetempo', 'licht',
        'inflation', 'netto', 'co2') then
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

-- --- Selbsttest: jedes neue Werkzeug einmal teilen, mit Rollback ---------------------
do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by follower_count desc limit 1;
  if v_id is null then raise notice 'Selbsttest 0094: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    v_j := public.create_post('', 'lab', null, null,
      '{"werkzeug": "inflation", "eingaben": {"betrag": 100, "von": 2000, "bis": 2025}}'::jsonb);
    v_j := public.create_post('', 'lab', null, null,
      '{"werkzeug": "netto", "eingaben": {"brutto": 2500}}'::jsonb);
    v_j := public.create_post('', 'lab', null, null,
      '{"werkzeug": "co2", "eingaben": {"km": 300, "mittel": "bahn"}}'::jsonb);
    if v_j->>'id' is null then raise exception 'Selbsttest 0094: kein Beitrag: %', v_j; end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0094: ok';
end
$test$;
