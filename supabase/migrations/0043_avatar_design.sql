-- =============================================================================
-- 0043_avatar_design.sql  ·  Das Profilbild darf selbst entworfen werden
--
-- Bisher war `avatar_seed` reine Serverware: beim Anlegen des Kontos einmal
-- gewuerfelt, danach unveraenderlich. Wer sein Muster nicht mochte, hatte
-- genau eine Moeglichkeit - ein Foto hochladen.
--
-- Jetzt darf die Spalte auch einen Entwurf enthalten. Die App kodiert
-- Farbe, Form, Kern und das 4x2-Raster in eine kurze Zeichenkette
-- (app/src/lib/avatarDesign.ts):
--
--     v1-<farbe><form><kern>-<hex>      z.B.  v1-210-a7
--
-- Warum das Format hier nochmal steht, statt dem Client zu glauben: eine
-- Spalte, in die der Client frei schreiben darf, ist eine Spalte, in der
-- irgendwann 40 kB Werbetext stehen. Passt der Wert nicht auf das Muster,
-- bleibt der alte Seed - kein Fehler, keine Meldung. Ein misslungener
-- Entwurf darf das Speichern von Name und Bio nicht mitreissen.
--
-- Alte Seeds (UUIDs) bleiben unberuehrt und werden weiter gehasht; die App
-- erkennt am Format, welcher Fall vorliegt.
-- =============================================================================

create or replace function public.update_my_settings(p_patch jsonb)
returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_out  public.profiles;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  update public.profiles set
    display_name       = coalesce(p_patch->>'display_name', display_name),
    bio                = case when p_patch ? 'bio' then nullif(trim(p_patch->>'bio'), '') else bio end,
    avatar_path        = case when p_patch ? 'avatar_path' then nullif(p_patch->>'avatar_path', '') else avatar_path end,
    -- Nur ein wohlgeformter Entwurf kommt durch. Alles andere wird still
    -- verworfen, siehe Kopf.
    avatar_seed        = case
                           when p_patch->>'avatar_seed' ~ '^v1-[0-7][0-2][01]-[0-9a-f]{2}$'
                             then p_patch->>'avatar_seed'
                           else avatar_seed
                         end,
    language           = coalesce(nullif(p_patch->>'language', ''), language),
    -- Geklemmt statt abgelehnt: ein Regler kann durch Rundung auf 101
    -- kommen, und dafuer soll die Einstellung nicht scheitern.
    feed_english_pct   = coalesce(
                           least(100, greatest(0, (p_patch->>'feed_english_pct')::smallint)),
                           feed_english_pct),
    country_code       = coalesce(nullif(p_patch->>'country_code', ''), country_code),
    region_code        = case when p_patch ? 'region_code'
                              then nullif(p_patch->>'region_code', '') else region_code end,
    timezone           = coalesce(nullif(p_patch->>'timezone', ''), timezone),
    leaderboard_opt_in = coalesce((p_patch->>'leaderboard_opt_in')::boolean, leaderboard_opt_in),
    likes_public       = coalesce((p_patch->>'likes_public')::boolean, likes_public),
    daily_goal_cards   = coalesce((p_patch->>'daily_goal_cards')::smallint, daily_goal_cards),
    notify_reviews     = coalesce((p_patch->>'notify_reviews')::boolean, notify_reviews),
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;
grant execute on function public.update_my_settings(jsonb) to authenticated;
