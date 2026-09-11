-- =============================================================================
-- 0037_comment_guard.sql  ·  Die Vorpruefung gehoert in die Datenbank
--
-- Was an 0036 nicht stimmte
-- -------------------------
-- Dort sollte die App den Beitrag pruefen und danach approve_comment()
-- rufen. Zwei Fehler darin:
--
--   1. Die App hat keinen Modellschluessel. Der liegt in der Pipeline und
--      hat dort nichts mit Kommentaren zu tun. Es gaebe also gar keine
--      Pruefung - nur einen Aufruf, der behauptet, es habe eine gegeben.
--   2. Eine Pruefung, die der Client ausloest, kann der Client ueberspringen.
--      Bei einer App fuer Vierzehnjaehrige ist das die falsche Stelle.
--
-- Also hier, wo niemand vorbeikommt: post_comment entscheidet selbst.
-- approve_comment bleibt als leere Huelle bestehen, damit nichts bricht,
-- tut aber nichts mehr.
--
-- Was diese Pruefung leistet - und was nicht
-- ------------------------------------------
-- Sie faengt das, was sich mit Mustern fangen laesst, und das ist
-- ausgerechnet das Gefaehrlichste: den Versuch, den Kontakt von der
-- Plattform wegzuverlagern. Links, Telefonnummern, Mailadressen,
-- Benutzernamen anderer Dienste. Genau darueber laeuft Anbahnung.
--
-- Dazu eine kurze Liste eindeutiger Beschimpfungen. Die ist ausdruecklich
-- KEINE Moderation - Wortlisten sind leicht zu umgehen und treffen
-- harmlose Saetze. Sie ist eine Bodenplatte, keine Decke. Darueber liegt
-- das Melden: drei Meldungen, und der Beitrag ist weg.
--
-- Was hier bewusst NICHT passiert: eine inhaltliche Bewertung. "Ist das
-- eine sinnvolle Frage?" kann dieser Code nicht beurteilen, und er soll
-- es auch nicht vortaeuschen.
-- =============================================================================

create or replace function public.comment_rejection(p_body text)
returns text
language plpgsql immutable set search_path = ''
as $fn$
declare
  v text := lower(p_body);
begin
  -- --- Kontaktaufnahme ausserhalb der App -----------------------------
  --
  -- Der wichtigste Teil. Wer ein Kind aus einer moderierten Umgebung
  -- herausholen will, braucht dafuer einen Kanal - und muss ihn nennen.
  if v ~ '(https?://|www\.)' then
    return 'Links sind in Kommentaren nicht erlaubt.';
  end if;
  if v ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return 'Keine Mailadressen in Kommentaren.';
  end if;
  -- Telefonnummern: mindestens sieben Ziffern, Leerzeichen und
  -- Trennzeichen dazwischen erlaubt.
  if regexp_replace(v, '[^0-9]', '', 'g') ~ '^[0-9]{7,}$'
     and v ~ '[0-9][0-9 /().+-]{6,}' then
    return 'Keine Telefonnummern in Kommentaren.';
  end if;
  if v ~ '\m(snapchat|snap|instagram|insta|whatsapp|telegram|discord|tiktok|signal)\M'
     and v ~ '[0-9@_.]' then
    return 'Kein Austausch von Kontaktdaten.';
  end if;
  -- ".com", ".de" und aehnliches auch ohne http davor.
  if v ~ '\m[a-z0-9-]{3,}\.(com|net|org|de|at|ch|io|me|xyz|link)\M' then
    return 'Links sind in Kommentaren nicht erlaubt.';
  end if;

  -- --- Eindeutige Beschimpfungen ---------------------------------------
  --
  -- Kurz gehalten und auf Wortgrenzen. Eine lange Liste faengt nicht mehr,
  -- sondern nur mehr Unschuldige.
  if v ~ '\m(fick|ficken|fotze|hurensohn|wichser|missgeburt|schlampe|nutte|'
       || 'fuck|bitch|cunt|whore|retard|faggot|nigger)\M' then
    return 'Bitte ohne Beschimpfungen.';
  end if;

  -- --- Offensichtlicher Unsinn -----------------------------------------
  if v !~ '[a-zäöüß]' then
    return 'Bitte schreib etwas mit Worten.';
  end if;
  -- Dasselbe Zeichen zehnmal hintereinander.
  if v ~ '(.)\1{9,}' then
    return 'Das sieht nach Tastatursalat aus.';
  end if;

  return null;
end
$fn$;


-- --- post_comment entscheidet jetzt selbst ---------------------------------
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

  if not exists (
    select 1 from public.user_content_state
     where user_id = v_me and content_id = p_content_id and is_read_validated
  ) then
    raise exception 'card not read yet';
  end if;

  if p_parent_id is not null and not exists (
    select 1 from public.comments
     where id = p_parent_id and content_id = p_content_id and parent_id is null
       and status = 'visible'
  ) then
    raise exception 'Antwort ohne Frage';
  end if;

  -- Die Pruefung. Faellt sie durch, wird der Beitrag trotzdem
  -- GESPEICHERT - als 'blocked'. Das ist Absicht: so sieht man beim
  -- Nachschauen, was abgelehnt wurde, und kann die Regeln daran
  -- schaerfen. Sichtbar ist er fuer niemanden, auch nicht fuer den
  -- Verfasser selbst.
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
exception
  when unique_violation then
    raise exception 'Du hast zu dieser Karte schon eine Frage gestellt';
end
$fn$;

grant execute on function public.post_comment(uuid, text, uuid) to authenticated;


-- --- approve_comment wird nicht mehr gebraucht ------------------------------
-- Bleibt als leere Huelle, damit ein aelterer App-Stand nicht mit einem
-- Fehler abstuerzt, wenn er sie noch ruft.
create or replace function public.approve_comment(p_id uuid, p_ok boolean, p_reason text default null)
returns void
language sql
as $fn$ select null::void; $fn$;

comment on function public.approve_comment(uuid, boolean, text) is
  'Veraltet seit 0037. Die Pruefung passiert in post_comment. Tut nichts.';
