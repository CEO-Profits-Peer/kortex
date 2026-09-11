-- =============================================================================
-- 0052_notify_social_setting.sql  ·  Der Schalter fuer 0051
--
-- Gehoerte inhaltlich in 0051 und steht aus einem schlichten Grund hier:
-- 0051 war bereits eingespielt, als mir auffiel, dass die neue Spalte
-- `notify_social` zwar existiert, aber von update_my_settings nicht
-- geschrieben wird. Eine angewandte Migration nachtraeglich zu aendern
-- waere wirkungslos (sie laeuft nicht noch einmal) und gefaehrlich (auf
-- einer frischen Datenbank liefe dann etwas anderes als hier).
--
-- Ohne diese Datei gaebe es die Spalte, einen Schalter in der App - und
-- keine Verbindung dazwischen. Genau die Sorte Halbfertigkeit, die erst
-- auffaellt, wenn sich jemand wundert, warum das Ausschalten nichts tut.
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
    avatar_seed        = case
                           when p_patch->>'avatar_seed' ~ '^v1-[0-7][0-2][01]-[0-9a-f]{2}$'
                             then p_patch->>'avatar_seed'
                           else avatar_seed
                         end,
    language           = coalesce(nullif(p_patch->>'language', ''), language),
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
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak),
    notify_social      = coalesce((p_patch->>'notify_social')::boolean, notify_social)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;
grant execute on function public.update_my_settings(jsonb) to authenticated;
