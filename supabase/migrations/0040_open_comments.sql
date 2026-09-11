-- =============================================================================
-- 0040_open_comments.sql  ·  Kommentare, offen
--
-- Was sich aendert und warum
-- --------------------------
-- Der enge Entwurf aus 0036 war meine Vorsicht, nicht deine Anforderung.
-- Drei Einschraenkungen fallen weg:
--
--   · Die Karte musste gelesen sein. Raus - das war eine Huerde vor einem
--     Kommentarbereich, der noch gar nicht lebt.
--   · Eine Frage pro Person und Karte. Raus - wer zwei Gedanken hat, soll
--     zwei schreiben duerfen.
--   · Nur "Fragen". Raus - es sind jetzt Kommentare, und Antworten darauf.
--
-- Was bleibt, und warum es bleibt
-- -------------------------------
-- Die Vorpruefung vor dem Senden, auf Beschimpfungen und Drohungen -
-- ausdruecklich gewuenscht. Und darueber hinaus weiterhin der Block auf
-- Links, Mailadressen und Telefonnummern.
--
-- Das letzte ist nicht bestellt, und ich lasse es trotzdem drin, weil es
-- der einzige Teil ist, der nicht Umgangston betrifft, sondern Sicherheit:
-- wer jemanden aus einer beaufsichtigten Umgebung herausholen will, muss
-- einen Kanal nennen. Es kostet niemanden etwas - in einem Kommentar zu
-- einer Lernkarte steht ohnehin keine Telefonnummer, ausser sie ist so
-- gemeint. Falls du es anders willst: eine Zeile in
-- comment_rejection(), und es ist weg.
--
-- Eine Ebene Verschachtelung bleibt ebenfalls. Nicht aus Vorsicht,
-- sondern weil tiefer verschachtelte Verlaeufe auf einem Handy nicht mehr
-- lesbar sind.
-- =============================================================================

-- --- Die Sperre "eine Frage pro Karte" faellt ------------------------------
drop index if exists public.comments_one_question_idx;


-- --- Beschimpfungen und Drohungen ------------------------------------------
create or replace function public.comment_rejection(p_body text)
returns text
language plpgsql immutable set search_path = ''
as $fn$
declare
  v text := lower(p_body);
begin
  -- --- Drohungen -------------------------------------------------------
  --
  -- Neu und ausdruecklich gewuenscht. Gesucht wird nicht nach einzelnen
  -- Woertern - "umbringen" steht auch in "die Zeit umbringen" -, sondern
  -- nach der Kombination aus Gewalt UND Adressat.
  if v ~ ('\m(umbringen|abstechen|erstechen|toeten|töten|erschiessen|erschießen|'
          || 'schlagen|verpruegeln|verprügeln|kaputtmachen|zerstoeren|fertigmachen|'
          || 'kill|stab|shoot|beat you|hurt you)\M')
     and v ~ '\m(dich|dir|euch|ihn|sie|ihr|you|him|her|them)\M' then
    return 'Das liest sich wie eine Drohung. Bitte anders formulieren.';
  end if;
  if v ~ '\m(halt die fresse|stirb|verreck|kill yourself|kys)\M' then
    return 'Das liest sich wie eine Drohung. Bitte anders formulieren.';
  end if;

  -- --- Beschimpfungen ---------------------------------------------------
  --
  -- Die Klammer um die Verkettung ist Pflicht: `~` und `||` haben in
  -- PostgreSQL dieselbe Rangfolge, ohne Klammer sieht der Vergleich nur
  -- die erste Haelfte. Siehe 0038, das hat einen halben Abend gekostet.
  if v ~ ('\m(fick|ficken|fotze|hurensohn|wichser|missgeburt|schlampe|nutte|'
          || 'arschloch|spast|behindert|opfer|'
          || 'fuck|bitch|cunt|whore|retard|faggot|nigger)\M') then
    return 'Bitte ohne Beschimpfungen.';
  end if;

  -- --- Kontaktaufnahme ausserhalb der App -------------------------------
  --
  -- Nicht bestellt, bleibt trotzdem: das ist der einzige Teil, bei dem es
  -- nicht um Umgangston geht.
  if v ~ '(https?://|www\.)' then
    return 'Links sind in Kommentaren nicht erlaubt.';
  end if;
  if v ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return 'Keine Mailadressen in Kommentaren.';
  end if;
  if regexp_replace(v, '[^0-9]', '', 'g') ~ '^[0-9]{7,}$'
     and v ~ '[0-9][0-9 /().+-]{6,}' then
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


-- --- Schreiben ohne Lesepflicht --------------------------------------------
create or replace function public.post_comment(
  p_content_id uuid,
  p_body       text,
  p_parent_id  uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me     uuid := auth.uid();
  v_body   text := btrim(p_body);
  v_reject text;
  v_id     uuid;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if length(v_body) < 2 or length(v_body) > 500 then
    raise exception 'Beitrag muss zwischen 2 und 500 Zeichen lang sein';
  end if;

  if not exists (select 1 from public.content_items
                  where id = p_content_id and status = 'approved') then
    raise exception 'Karte gibt es nicht';
  end if;

  if p_parent_id is not null and not exists (
    select 1 from public.comments
     where id = p_parent_id and content_id = p_content_id and parent_id is null
       and status = 'visible'
  ) then
    raise exception 'Antwort ohne Beitrag';
  end if;

  -- Abgelehnte Beitraege werden trotzdem gespeichert, nur unsichtbar. So
  -- sieht man beim Nachschauen, was die Pruefung faengt, und kann sie
  -- daran schaerfen.
  v_reject := public.comment_rejection(v_body);

  insert into public.comments (content_id, user_id, parent_id, body, status, block_reason)
  values (
    p_content_id, v_me, p_parent_id, v_body,
    case when v_reject is null then 'visible' else 'blocked' end,
    v_reject
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_reject is null then 'visible' else 'blocked' end,
    'reason', v_reject
  );
end
$fn$;

grant execute on function public.post_comment(uuid, text, uuid) to authenticated;
