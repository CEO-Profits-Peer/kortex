-- =============================================================================
-- 0071_invites.sql  ·  Einladen: ein Link, und ihr folgt euch
--
-- `referral_code`, `referred_by` und die Tabelle `referrals` stehen seit 0001
-- im Schema und wurden nie benutzt. Jetzt der Grund, sie zu benutzen: die
-- Freunde-Rangliste (0066) und die Duelle (0069) funktionieren erst, wenn man
-- Leute kennt, die die App auch haben. Ein Duell braucht jemanden, dem man
-- folgt; eine Freundesliste braucht gegenseitige Follows. Wer bisher einen
-- Freund in die App holte, musste danach dessen Handle suchen, folgen, und
-- darauf hoffen, dass er zurueckfolgt.
--
-- Der Link erledigt das in einem Schritt: wer ueber ihn ein Konto anlegt, und
-- wer den Link verschickt hat, folgen einander sofort. Damit stehen beide auf
-- der Freunde-Rangliste des anderen, und ein Duell ist ab der ersten Minute
-- moeglich.
--
-- Drei Entscheidungen
-- -------------------
--   1. KEINE BELOHNUNG, noch nicht. `referrals.validated_at` und
--      `reward_issued` bleiben leer. Eine Belohnung fuer Einladungen ist
--      der Anreiz, sich selbst zwanzig Konten anzulegen - der Plan in 0001
--      war deshalb "erst nach drei validierten Lesetagen". Das kommt, wenn es
--      eine Belohnung gibt, die das rechtfertigt. Bis dahin ist die gegen-
--      seitige Folge Anreiz genug und kostet niemanden etwas.
--
--   2. NUR IN DEN ERSTEN SIEBEN TAGEN. Eine Einladung ist der Weg IN die
--      App. Wer seit Monaten da ist und einen Code nachtraeglich eintraegt,
--      wurde nicht eingeladen - er baut sich eine Statistik.
--
--   3. EINMAL. `referrals.invitee_id` ist eindeutig, `referred_by` wird nur
--      gesetzt, wenn es leer ist. Wer zwei Links bekommt, gehoert dem ersten.
--
-- Die Antwort ist ein Status, keine Exception: die App loest den Code still im
-- Hintergrund ein, und "ungueltig" oder "schon eingeladen" ist dort kein
-- Fehler, den jemand sehen muesste, sondern ein Grund, den Code zu vergessen.
-- =============================================================================


-- --- Wer hat eingeladen? -------------------------------------------------------
--
-- Fuer den Startbildschirm, VOR der Anmeldung - deshalb auch fuer anon. Es
-- geht nur heraus, was ohnehin oeffentlich ist (Handle, Name, Bild), und nur
-- fuer einen gueltigen Code. Sieben Zeichen aus 0-9A-F sind 268 Millionen
-- Moeglichkeiten; wer rät, bekommt Handles, die auch in der Rangliste stehen.
create or replace function public.invite_preview(p_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
           'handle',      p.handle,
           'name',        p.display_name,
           'avatar_seed', p.avatar_seed,
           'avatar_path', p.avatar_path
         )
    from public.profiles p
   where p.referral_code = upper(trim(coalesce(p_code, '')))
   limit 1;
$fn$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;


-- --- Einloesen -------------------------------------------------------------------
create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me  uuid := auth.uid();
  v_ich public.profiles;
  v_von uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_ich from public.profiles where id = v_me;
  if v_ich.id is null then
    return jsonb_build_object('status', 'kein_profil');
  end if;

  select p.id into v_von from public.profiles p
   where p.referral_code = upper(trim(coalesce(p_code, '')));
  if v_von is null then
    return jsonb_build_object('status', 'ungueltig');
  end if;
  if v_von = v_me then
    return jsonb_build_object('status', 'selbst');
  end if;

  if v_ich.referred_by is not null
     or exists (select 1 from public.referrals r where r.invitee_id = v_me) then
    return jsonb_build_object('status', 'schon_eingeladen');
  end if;

  if v_ich.created_at < now() - interval '7 days' then
    return jsonb_build_object('status', 'zu_alt');
  end if;

  update public.profiles set referred_by = v_von where id = v_me;

  insert into public.referrals (inviter_id, invitee_id)
  values (v_von, v_me)
  on conflict (invitee_id) do nothing;

  -- Beide Richtungen. Der Zaehler-Trigger aus 0016 fuehrt follower_count und
  -- following_count selbst nach; hier wird nichts von Hand hochgezaehlt.
  insert into public.follows (follower_id, followee_id)
  values (v_me, v_von)
  on conflict do nothing;
  insert into public.follows (follower_id, followee_id)
  values (v_von, v_me)
  on conflict do nothing;

  return jsonb_build_object('status', 'ok');
end
$fn$;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;


-- --- Mein Code -------------------------------------------------------------------
create or replace function public.my_invite()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
           'code',       p.referral_code,
           'eingeladen', (select count(*) from public.referrals r where r.inviter_id = p.id)
         )
    from public.profiles p
   where p.id = auth.uid();
$fn$;

revoke all on function public.my_invite() from public, anon;
grant execute on function public.my_invite() to authenticated;
