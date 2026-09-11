-- =============================================================================
-- 0038_comment_guard_fix.sql  ·  Eine fehlende Klammer
--
-- Der Fehler
-- ----------
--     2201B  invalid regular expression: parentheses () not balanced
--
-- Und zwar bei HARMLOSEN Kommentaren: "Warum 72 und nicht 70?" lief in
-- einen Datenbankfehler, waehrend Links und Beschimpfungen sauber
-- abgelehnt wurden. Die gefaehrlichen Faelle funktionierten, die
-- gutartigen stuerzten ab - die unangenehmste Sorte Fehler, weil sie beim
-- Testen mit Absicht erst auffaellt, wenn man auch das Normale probiert.
--
-- Die Ursache
-- -----------
-- Die Wortliste war ueber zwei Zeilen geschrieben:
--
--     if v ~ '\m(fick|...|'
--          || 'fuck|...)\M' then
--
-- In PostgreSQL haben `~` und `||` DIESELBE Rangfolge und binden von
-- links. Der Ausdruck wurde also gelesen als
--
--     (v ~ '\m(fick|...|') || 'fuck|...)\M'
--
-- - und die erste Haelfte allein hat eine offene Klammer. Die Zeile sieht
-- richtig aus und ist es nicht; genau deshalb steht hier jetzt eine
-- Klammer, die aussieht, als braeuchte man sie nicht.
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

  -- --- Eindeutige Beschimpfungen ---------------------------------------
  --
  -- Die Klammer um die Verkettung ist Pflicht, nicht Geschmack: ohne sie
  -- bindet `~` staerker und bekommt eine halbe Zeichenkette zu sehen.
  if v ~ ('\m(fick|ficken|fotze|hurensohn|wichser|missgeburt|schlampe|nutte|'
          || 'fuck|bitch|cunt|whore|retard|faggot|nigger)\M') then
    return 'Bitte ohne Beschimpfungen.';
  end if;

  -- --- Offensichtlicher Unsinn -----------------------------------------
  if v !~ '[a-zäöüß]' then
    return 'Bitte schreib etwas mit Worten.';
  end if;
  if v ~ '(.)\1{9,}' then
    return 'Das sieht nach Tastatursalat aus.';
  end if;

  return null;
end
$fn$;
