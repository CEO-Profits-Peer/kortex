-- =============================================================================
-- 0090_telefon_zu_strikt.sql  ·  Zahlen in Umfragen sind keine Telefonnummer
--
-- Gemeldet: "Wenn man bei Umfragen Zahlen verwendet, sagt es gleich
-- Telefonnummer - zu strikt."
--
-- Zwei Ursachen, beide behoben:
--   1. create_post klebte Frage und Antworten mit LEERZEICHEN zusammen, bevor
--      geprueft wurde. "1990", "2000", "2010" wurden zu "1990 2000 2010".
--      Jetzt mit Zeilenumbruch; der zaehlt nicht als Teil einer Nummer.
--   2. comment_rejection zaehlte Ziffern ueber den GANZEN Text. Jetzt je
--      zusammenhaengender Folge, und erst ab neun Ziffern.
--
-- Beide Funktionen sind vollstaendig uebernommen (comment_rejection aus 0041,
-- create_post aus 0088); geaendert ist nur, was oben steht. post_rejection
-- ruft comment_rejection auf und braucht nichts.
-- =============================================================================

create or replace function public.comment_rejection(p_body text)
returns text
language plpgsql immutable set search_path = ''
as $fn$
declare
  v     text := lower(p_body);
  v_du  text := '\m(dich|dir|euch|ihn|ihr|sie|you|him|her|them)\M';
begin
  -- --- Drohungen: zusammengeschriebene Form ----------------------------
  if v ~ ('\m(umbringen|abstechen|erstechen|toeten|töten|erschiessen|erschießen|'
          || 'verpruegeln|verprügeln|kaputtmachen|zerstoeren|zerstören|fertigmachen|'
          || 'zusammenschlagen|'
          || 'kill|stab|shoot|beat you|hurt you)\M')
     and v ~ v_du then
    return 'Das liest sich wie eine Drohung. Bitte anders formulieren.';
  end if;

  -- --- Drohungen: getrennte Form ---------------------------------------
  --
  -- Verbstamm ... Adressat ... Vorsilbe. Der Abstand ist auf rund 30
  -- Zeichen begrenzt, damit nicht zwei voellig unabhaengige Saetze
  -- zusammen einen Treffer ergeben.
  if v ~ ('\m(bring|bringe|bringst|bringt|mach|mache|machst|macht|'
          || 'schlag|schlage|schlaegst|schlägst|hau|haue)\M'
          || '.{0,30}' || v_du || '.{0,30}'
          || '\m(um|fertig|zusammen|kaputt|tot)\M') then
    return 'Das liest sich wie eine Drohung. Bitte anders formulieren.';
  end if;

  if v ~ '\m(halt die fresse|stirb|verreck|kill yourself|kys)\M' then
    return 'Das liest sich wie eine Drohung. Bitte anders formulieren.';
  end if;

  -- --- Beschimpfungen ---------------------------------------------------
  if v ~ ('\m(fick|ficken|fotze|hurensohn|wichser|missgeburt|schlampe|nutte|'
          || 'arschloch|spast|behindert|opfer|'
          || 'fuck|bitch|cunt|whore|retard|faggot|nigger)\M') then
    return 'Bitte ohne Beschimpfungen.';
  end if;

  -- --- Kontaktaufnahme ausserhalb der App -------------------------------
  if v ~ '(https?://|www\.)' then
    return 'Links sind in Kommentaren nicht erlaubt.';
  end if;
  if v ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return 'Keine Mailadressen in Kommentaren.';
  end if;
  -- 0090: Telefonnummern werden je zusammenhaengender Ziffernfolge gezaehlt,
  -- nicht mehr ueber den ganzen Text. Vorher reichten sieben Ziffern IRGENDWO
  -- plus eine Stelle mit Ziffer und Leerzeichen - eine Umfrage "1990 / 2000 /
  -- 2010" war damit eine Telefonnummer. Jetzt muss EINE Folge (Ziffern mit
  -- Leerzeichen, Strich, Schraegstrich, Klammern, Punkt) mindestens neun
  -- Ziffern haben: so kurz ist keine Nummer mit Vorwahl, und so lang ist
  -- kaum eine Jahreszahl, ein Preis oder ein Ergebnis.
  if exists (
    select 1
      from regexp_matches(v, '[+]?[0-9][0-9 /().-]{5,}[0-9]', 'g') as m(t)
     where length(regexp_replace(m.t[1], '[^0-9]', '', 'g')) >= 9
  ) then
    return 'Keine Telefonnummern in Kommentaren.';
  end if;
  if v ~ '\m(snapchat|snap|instagram|insta|whatsapp|telegram|discord|tiktok|signal)\M'
     and v ~ '[0-9@_.]' then
    return 'Kein Austausch von Kontaktdaten.';
  end if;
  if v ~ '\m[a-z0-9-]{3,}\.(com|net|org|de|at|ch|io|me|xyz|link)\M' then
    return 'Links sind in Kommentaren nicht erlaubt.';
  end if;

  -- --- Offensichtlicher Unsinn ------------------------------------------
  if v !~ '[a-zäöüß]' then
    return 'Bitte schreib etwas mit Worten.';
  end if;
  if v ~ '(.)\1{9,}' then
    return 'Das sieht nach Tastatursalat aus.';
  end if;

  return null;
end
$fn$;

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


-- --- Selbsttest ------------------------------------------------------------------
do $test$
begin
  if public.comment_rejection(E'Wann war das?
1990
2000
2010') is not null then
    raise exception 'Selbsttest: Jahreszahlen gelten als Telefonnummer';
  end if;
  if public.comment_rejection(E'Wie viele?
12
24
36
48') is not null then
    raise exception 'Selbsttest: kleine Zahlen gelten als Telefonnummer';
  end if;
  if public.comment_rejection('Das kostet 1.299 Euro und wiegt 250 g') is not null then
    raise exception 'Selbsttest: Preis gilt als Telefonnummer';
  end if;
  if public.comment_rejection('Ruf mich an: 0664 123 4567') is null then
    raise exception 'Selbsttest: Handynummer wird nicht erkannt';
  end if;
  if public.comment_rejection('schreib mir +43 1 234 5678') is null then
    raise exception 'Selbsttest: Nummer mit Landesvorwahl wird nicht erkannt';
  end if;
  if public.comment_rejection('call 416-555-0199 now') is null then
    raise exception 'Selbsttest: kanadische Nummer wird nicht erkannt';
  end if;
  raise notice 'Selbsttest Telefon: ok';
end
$test$;

notify pgrst, 'reload schema';
