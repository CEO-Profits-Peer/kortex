-- =============================================================================
-- 0089_avatar_waben.sql  ·  Profilbild-Format v2 (Wabenraster)
--
-- Der neue Editor zeichnet auf 37 Waben mit zwei Farben, Hintergrund und
-- Stil. Das passt nicht ins alte Format v1 (8 Felder, eine Farbe), also gibt
-- es v2:  v2-<hintergrund><farbe1><farbe2><stil>-<19 hex>
-- Jede Wabe hat 2 Bit (aus, Farbe 1, Farbe 2), 37 Waben = 74 Bit = 19 Hex.
--
-- update_my_settings ist VOLLSTAENDIG aus 0084 uebernommen; geaendert ist nur
-- die Pruefung von avatar_seed. v1 bleibt gueltig - bestehende Bilder
-- aendern sich nicht. Alles andere wird weiterhin still verworfen, damit
-- niemand beliebigen Text in die Spalte schreibt.
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
                              or p_patch->>'avatar_seed' ~ '^v2-[0-9a-z]{4}-[0-9a-f]{19}$'
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
    notify_social      = coalesce((p_patch->>'notify_social')::boolean, notify_social),
    beitraege_oeffentlich = coalesce((p_patch->>'beitraege_oeffentlich')::boolean, beitraege_oeffentlich),
    reposts_nur_profil    = coalesce((p_patch->>'reposts_nur_profil')::boolean, reposts_nur_profil),
    home_ohne_reposts     = coalesce((p_patch->>'home_ohne_reposts')::boolean, home_ohne_reposts)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;
grant execute on function public.update_my_settings(jsonb) to authenticated;

-- --- Selbsttest: v2 wird gespeichert, Unsinn nicht. Rollt alles zurueck. ----------
do $test$
declare
  v_id  uuid;
  v_alt text;
  v_neu public.profiles;
begin
  select id, avatar_seed into v_id, v_alt from public.profiles order by created_at limit 1;
  if v_id is null then
    raise notice 'Selbsttest: kein Konto - uebersprungen';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);

  begin
    v_neu := public.update_my_settings('{"avatar_seed": "v2-0a31-0123456789abcdef012"}'::jsonb);
    if v_neu.avatar_seed <> 'v2-0a31-0123456789abcdef012' then
      raise exception 'Selbsttest: v2 wurde nicht gespeichert';
    end if;
    v_neu := public.update_my_settings('{"avatar_seed": "v2-kaputt"}'::jsonb);
    if v_neu.avatar_seed <> 'v2-0a31-0123456789abcdef012' then
      raise exception 'Selbsttest: ungueltiger Seed wurde uebernommen';
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest avatar v2: ok';
end
$test$;

notify pgrst, 'reload schema';
