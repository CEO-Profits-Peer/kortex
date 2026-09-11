-- =============================================================================
-- 0021_google_identity.sql  ·  Anmelden mit Google
--
-- Die Anmeldung selbst macht Supabase. Was Supabase NICHT macht: aus dem
-- Google-Konto einen brauchbaren Profileintrag bauen. Ohne das hiesse jeder
-- Google-Nutzer "grid7f3a91" und haette kein Bild - obwohl Name und Bild
-- direkt mitgeliefert werden.
--
-- Zwei Wege fuehren zu einem Google-Konto, und sie brauchen unterschiedliche
-- Behandlung:
--
--   NEU        Es gab vorher kein Konto. Der Trigger auf auth.users legt das
--              Profil an und kann die Google-Daten gleich mitnehmen.
--   VERKNUEPFT Ein anonymes Konto bekommt Google dazu (linkIdentity). Dann
--              wird KEIN neuer Nutzer angelegt, der Trigger feuert nicht -
--              und das Profil bleibt so leer, wie es war. Dafuer gibt es
--              unten adopt_identity_profile().
--
-- Der zweite Weg ist der wichtigere: er ist der einzige, bei dem der
-- Fortschritt erhalten bleibt. Wer erst eine Woche lernt und sich dann
-- anmeldet, darf dabei nicht bei null anfangen.
-- =============================================================================


-- --- Name und Bild aus den Anmeldedaten uebernehmen (Weg NEU) --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_base   text;
  v_handle text;
  v_try    int := 0;
  v_name   text;
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

  insert into public.profiles (id, handle, display_name, birth_year, country_code, language)
  values (
    new.id,
    v_handle,
    left(v_name, 40),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'birth_year', '')::smallint,
      (extract(year from now()) - 18)::smallint
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'country_code', ''), 'AT'),
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'de')
  )
  on conflict (id) do nothing;

  return new;
end
$fn$;


-- =============================================================================
-- Weg VERKNUEPFT: nach dem Verknuepfen nachziehen
--
-- Wird von der App genau einmal nach erfolgreicher Google-Anmeldung gerufen.
--
-- Absichtlich zurueckhaltend: es wird nur gefuellt, was leer ist. Wer seinen
-- Anzeigenamen selbst gesetzt hat, bekommt ihn nicht von Google
-- ueberschrieben - der selbst gewaehlte Name ist der gewollte.
--
-- Das Handle wird nur ersetzt, wenn es noch der generierte Platzhalter ist
-- ("grid" plus Hexziffern). Ein Handle, das schon irgendwo verlinkt sein
-- koennte, bleibt unangetastet.
-- =============================================================================
create or replace function public.adopt_identity_profile()
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_meta  jsonb;
  v_email text;
  v_name  text;
  v_base  text;
  v_try   int := 0;
  v_out   jsonb;
begin
  if v_me is null then
    raise exception 'nicht angemeldet';
  end if;

  select u.raw_user_meta_data, u.email into v_meta, v_email
    from auth.users u where u.id = v_me;

  v_name := nullif(trim(coalesce(
    v_meta ->> 'full_name',
    v_meta ->> 'name'
  )), '');

  -- Anzeigename, nur wenn noch keiner da ist.
  if v_name is not null then
    update public.profiles
       set display_name = left(v_name, 40)
     where id = v_me
       and coalesce(trim(display_name), '') = '';
  end if;

  -- Handle nur, solange es der Platzhalter ist.
  v_base := lower(regexp_replace(split_part(coalesce(v_email, ''), '@', 1),
                                 '[^a-z0-9_]', '', 'g'));
  if length(coalesce(v_base, '')) >= 3 then
    v_base := left(v_base, 14);
    if exists (
      select 1 from public.profiles p
       where p.id = v_me and p.handle ~ '^grid[0-9a-f]+$'
    ) then
      while exists (select 1 from public.profiles p where p.handle = v_base) loop
        v_try := v_try + 1;
        v_base := left(v_base, 14) || substr(md5(random()::text), 1, 4);
        exit when v_try > 10;
      end loop;
      update public.profiles set handle = v_base
       where id = v_me and handle ~ '^grid[0-9a-f]+$';
    end if;
  end if;

  select jsonb_build_object(
    'handle', p.handle,
    'display_name', p.display_name
  ) into v_out
  from public.profiles p where p.id = v_me;

  return v_out;
end
$fn$;

grant execute on function public.adopt_identity_profile() to authenticated;
