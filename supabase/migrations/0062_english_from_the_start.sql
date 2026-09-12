-- =============================================================================
-- 0062_english_from_the_start.sql  ·  Englische Oberflaeche, deutscher Feed
--
-- Gemeldet als Wunsch ("mehr Englisch"), gefunden als Fehler.
--
-- Der Bestand ist gar nicht deutschlastig: 106 deutsche und 93 englische
-- Karten, also 47 Prozent Englisch. Im Feed sieht es anders aus, und zwar
-- aus zwei Gruenden.
--
-- 1. Der Fehler
--    0029 hat den Regler eingefuehrt und die BESTEHENDEN englischen Konten
--    einmalig auf 100 gesetzt:
--
--      update public.profiles set feed_english_pct = 100 where language = 'en';
--
--    Nur: handle_new_user() setzt die Spalte nie. Jedes seither angelegte
--    Konto bekommt den Spaltenstandard - unabhaengig davon, in welcher
--    Sprache es angelegt wurde. Sieben der achtundzwanzig Konten bedienen
--    die App auf Englisch und bekommen einen Feed, der zu drei Vierteln
--    deutsch ist. Ein einmaliges `update` in einer Migration reicht nicht,
--    wenn der Weg, auf dem die Zeilen entstehen, davon nichts weiss - das
--    ist der eigentliche Fehler hier, nicht die Zahl.
--
-- 2. Der Standard
--    25 Prozent waren als "ungefaehr das, was die alte Nothilfe-Regel
--    geliefert hat" begruendet. Das war eine Fortschreibung, keine
--    Entscheidung. Der Vorrat ist halb englisch, also ist die Mitte der
--    ehrlichere Startwert: wer nur Deutsch will, hat mit "DE" einen Tipp
--    dafuer - und sieht dabei ueberhaupt erst, dass es den Regler gibt.
--
-- Was diese Migration ABSICHTLICH NICHT tut: bestehende Konten anfassen.
-- 25 ist eine waehlbare Stufe ("¾ DE"), und von hier aus ist nicht
-- unterscheidbar, ob jemand sie gewaehlt hat oder nie gesehen hat. Fremde
-- Einstellungen im Vorbeigehen zu aendern, weil die Mehrheit davon wohl
-- nichts gemerkt haette, ist kein Fehlerbehebung. Wer mehr Englisch will,
-- tippt in den Einstellungen auf "½" oder "¾ EN".
-- =============================================================================

alter table public.profiles
  alter column feed_english_pct set default 50;

comment on column public.profiles.feed_english_pct is
  'Anteil englischer Inhalte im Feed. 0 = nur Deutsch, 100 = nur Englisch. '
  'Der Standard wird beim Anlegen aus der Sprache der Anmeldung abgeleitet '
  '(siehe handle_new_user).';


-- --- Beim Anlegen die Sprache mitnehmen ------------------------------------
--
-- Vollstaendig neu geschrieben aus der Fassung von 0021 - dieselbe Logik
-- fuer Handle und Namen, eine Spalte mehr. Die Handle-Schleife bleibt
-- unveraendert, auch die Notbremse bei zwanzig Versuchen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_base   text;
  v_handle text;
  v_try    int := 0;
  v_name   text;
  v_lang   text;
begin
  v_base := lower(regexp_replace(
    coalesce(
      new.raw_user_meta_data ->> 'handle',
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    '[^a-z0-9_]', '', 'g'
  ));

  if v_base is null or length(v_base) < 3 then
    v_base := 'grid' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  v_base   := left(v_base, 14);
  v_handle := v_base;

  while exists (select 1 from public.profiles p where p.handle = v_handle) loop
    v_try := v_try + 1;
    v_handle := left(v_base, 14) || substr(md5(random()::text), 1, 5);
    if v_try > 20 then
      v_handle := 'grid' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      exit;
    end if;
  end loop;

  -- Google liefert je nach Kontotyp 'full_name' oder 'name'. Beide pruefen,
  -- keins voraussetzen.
  v_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  )), '');

  v_lang := coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'de');

  insert into public.profiles (
    id, handle, display_name, birth_year, country_code, language,
    feed_english_pct
  )
  values (
    new.id,
    v_handle,
    left(v_name, 40),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'birth_year', '')::smallint,
      (extract(year from now()) - 18)::smallint
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'country_code', ''), 'AT'),
    v_lang,
    -- Wer die App auf Englisch anlegt, will englische Inhalte. Nicht
    -- "auch ein paar" - das ist der Fall, den 0029 fuer die damals
    -- bestehenden Konten schon so entschieden hat. Deutsch startet in der
    -- Mitte, weil der Vorrat halb englisch ist.
    case when v_lang = 'en' then 100 else 50 end
  )
  on conflict (id) do nothing;

  return new;
end
$fn$;
