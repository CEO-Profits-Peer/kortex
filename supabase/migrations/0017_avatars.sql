-- =============================================================================
-- 0017_avatars.sql  ·  Speicher für Profilbilder
--
-- Ein öffentlicher Bucket: Profilbilder werden in Ranglisten, im Freundes-Feed
-- und auf fremden Profilen angezeigt. Sie hinter signierten URLs zu verstecken
-- hiesse, für jede Liste dutzende Signaturen zu erzeugen - viel Aufwand für
-- ein Bild, das die Person selbst öffentlich machen wollte.
--
-- Der Schutz liegt woanders: SCHREIBEN darf jeder nur in seinen eigenen
-- Ordner. Der Pfad ist `<user-id>/avatar.jpg`, und die Policy vergleicht das
-- erste Pfadsegment mit auth.uid().
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  -- 2 MB. Ein Profilbild wird nie größer als 512 px angezeigt; wer mehr
  -- hochlädt, verbrennt nur Freikontingent.
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];


-- --- Lesen: für alle, auch nicht angemeldet (Bilder in <img>-Tags) ---------
drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- --- Schreiben: nur in den eigenen Ordner ---------------------------------
-- storage.foldername(name) liefert die Pfadsegmente. [1] ist der erste
-- Ordner, also die Nutzer-ID.
drop policy if exists "avatar upload own" on storage.objects;
create policy "avatar upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatar delete own" on storage.objects;
create policy "avatar delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- =============================================================================
-- Beim Löschen des Kontos muss das Bild mitgehen
--
-- DSGVO Art. 17: "alle Daten". Ein verwaistes Profilbild in einem
-- öffentlichen Bucket wäre genau das, was die Löschung verhindern soll.
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  delete from storage.objects
   where bucket_id = 'avatars'
     and (storage.foldername(name))[1] = v_user::text;

  -- Alles Uebrige haengt per ON DELETE CASCADE an auth.users.
  delete from auth.users where id = v_user;
end
$fn$;
grant execute on function public.delete_my_account() to authenticated;
