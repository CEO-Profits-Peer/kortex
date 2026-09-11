-- =============================================================================
-- 0041_threat_separable.sql  ·  "Ich bring dich um"
--
-- Die Pruefung aus 0040 kannte "umbringen" und liess "Ich bring dich um"
-- durch. Deutsch trennt seine Verben: im Hauptsatz steht die Vorsilbe am
-- Ende, und dazwischen passt der ganze Satz.
--
--     umbringen   ->  ich bringe dich um
--     fertigmachen ->  ich mach dich fertig
--     zusammenschlagen -> ich schlag dich zusammen
--
-- Eine Wortliste, die nur die Grundform kennt, faengt also ausgerechnet
-- die Formulierung nicht, die jemand tatsaechlich tippt.
--
-- Deshalb ein zweites Muster: Verbstamm, dann Adressat, dann Vorsilbe -
-- in dieser Reihenfolge, mit begrenztem Abstand. Der Adressat ist dabei
-- die Bedingung, die Fehlalarme verhindert: "die Zeit umbringen" hat
-- keinen, "dich umbringen" schon.
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
