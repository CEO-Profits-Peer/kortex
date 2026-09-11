-- =============================================================================
-- 0013_hardening_settings.sql
--
-- TEIL 1 · Zwei XP-Luecken schliessen (beim Durchsehen gefunden)
-- TEIL 2 · Einstellungen, Datenexport und Kontoloeschung
-- =============================================================================


-- =============================================================================
-- TEIL 1a · submit_quiz: nur beantworten, was gelesen wurde
--
-- Bisher konnte ein Client beliebige content_ids durchprobieren, ohne die
-- Karte je gesehen zu haben. Beim ersten Versuch bekommt er die richtige
-- Antwort zurueck, beim zweiten kassiert er sie - 25 XP + 10 Mastery pro
-- Karte, ohne zu lesen.
--
-- Passt auch zur Produktlogik: uebersprungene Karten fliegen ohnehin aus dem
-- Fragen-Pool. Etwas abzufragen, das nie gelesen wurde, waere unfair.
-- =============================================================================

create or replace function public.submit_quiz(
  p_content_id uuid,
  p_quiz_index smallint,
  p_answer     smallint
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user    uuid := auth.uid();
  v_item    public.content_items;
  v_state   public.user_content_state;
  v_quiz    jsonb;
  v_correct boolean;
  v_first   boolean;
  v_xp      int;
  v_mastery int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_item from public.content_items
   where id = p_content_id and status = 'approved';
  if v_item.id is null then raise exception 'unknown content'; end if;

  select * into v_state from public.user_content_state
   where user_id = v_user and content_id = p_content_id;

  -- Der eigentliche Riegel.
  if v_state.user_id is null or not v_state.is_read_validated then
    raise exception 'card not read yet';
  end if;

  v_quiz := v_item.quiz_items -> p_quiz_index::int;
  if v_quiz is null then raise exception 'unknown quiz item'; end if;

  v_correct := (v_quiz->>'correct_index')::smallint = p_answer;
  v_first := v_state.quiz_attempts = 0;

  update public.user_content_state
     set quiz_attempts = quiz_attempts + 1,
         quiz_correct  = quiz_correct + (case when v_correct then 1 else 0 end)
   where user_id = v_user and content_id = p_content_id;

  if v_correct then
    v_xp      := case when v_first then 25 else 8 end;
    v_mastery := case when v_first then 10 else 3 end;
    perform public.award_xp(v_user, v_xp, v_mastery,
              case when v_first then 'quiz_correct' else 'quiz_retry' end,
              v_item.primary_category_id, 'quiz',
              p_content_id::text || ':' || p_quiz_index::text);

    insert into public.review_queue (user_id, content_id, quiz_index, category_id,
                                     interval_days, repetitions, due_at)
    values (v_user, p_content_id, p_quiz_index, v_item.primary_category_id,
            1, 1, now() + interval '1 day')
    on conflict (user_id, content_id, quiz_index) do nothing;
  else
    v_xp := 0; v_mastery := 0;
    insert into public.review_queue (user_id, content_id, quiz_index, category_id, due_at)
    values (v_user, p_content_id, p_quiz_index, v_item.primary_category_id,
            now() + interval '10 minutes')
    on conflict (user_id, content_id, quiz_index) do update
      set due_at = now() + interval '10 minutes',
          ease   = greatest(1.3, review_queue.ease - 0.2),
          lapses = review_queue.lapses + 1;
  end if;

  return jsonb_build_object(
    'correct',       v_correct,
    'correct_index', (v_quiz->>'correct_index')::smallint,
    'explanation',   v_quiz->>'explanation',
    'xp',            v_xp,
    'mastery',       v_mastery
  );
end
$fn$;


-- =============================================================================
-- TEIL 1b · claim_batch_bonus: zwei Luecken
--
-- 1) Der Client hat behauptet, ob alles richtig war (p_all_correct). Das ist
--    eine Behauptung, keine Pruefung - "alles richtig" liess sich einfach
--    mitsenden.
-- 2) Mit EINER gelesenen Karte war die Bedingung erfuellt, und der
--    Dedupe-Schluessel unterscheidet sich pro ID. Also: 50 XP pro Karte,
--    beliebig oft wiederholbar.
--
-- Jetzt: Mindestgroesse aus app_config, und "alles richtig" wird aus
-- user_content_state hergeleitet. Der Parameter bleibt aus Kompatibilitaets-
-- gruenden stehen, wird aber ignoriert.
-- =============================================================================

create or replace function public.claim_batch_bonus(
  p_content_ids uuid[],
  p_all_correct boolean default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user     uuid := auth.uid();
  v_key      text;
  v_size     int  := coalesce(array_length(p_content_ids, 1), 0);
  v_min      int;
  v_valid    int;
  v_attempted int;
  v_wrong    int;
  v_all_ok   boolean;
  v_granted  boolean;
  v_xp       int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select coalesce((value->>'batch_size')::int, 10) into v_min
    from public.app_config where key = 'variance';
  v_min := coalesce(v_min, 10);

  if v_size < v_min then
    return jsonb_build_object('granted', false, 'reason', 'batch too small');
  end if;

  select count(*) into v_valid
    from public.user_content_state
   where user_id = v_user and content_id = any(p_content_ids) and is_read_validated;

  if v_valid < v_size then
    return jsonb_build_object('granted', false, 'reason', 'not all validated');
  end if;

  -- "Alles richtig" wird hergeleitet, nicht geglaubt: mindestens eine Frage
  -- beantwortet, und keine davon falsch.
  select count(*) filter (where quiz_attempts > 0),
         count(*) filter (where quiz_attempts > quiz_correct)
    into v_attempted, v_wrong
    from public.user_content_state
   where user_id = v_user and content_id = any(p_content_ids);

  v_all_ok := v_attempted > 0 and v_wrong = 0;
  v_xp     := case when v_all_ok then 50 else 0 end;

  select md5(string_agg(x::text, ',' order by x)) into v_key
    from unnest(p_content_ids) x;

  v_granted := v_all_ok and public.award_xp(
    v_user, v_xp, case when v_all_ok then 10 else 0 end,
    'batch_bonus', null, 'batch', v_key
  );

  return jsonb_build_object(
    'granted', coalesce(v_granted, false),
    'xp',      case when coalesce(v_granted, false) then v_xp else 0 end,
    'reason',  case when v_all_ok then null else 'not all correct' end
  );
end
$fn$;
grant execute on function public.claim_batch_bonus(uuid[], boolean) to authenticated;


-- =============================================================================
-- TEIL 1c · get_category_detail lieferte NULL bei unbekannter Kategorie
--
-- Der Client wartete dann ewig auf einen Ladebalken. Jetzt gibt es eine
-- klare Fehlermeldung.
-- =============================================================================

create or replace function public.get_category_detail(p_category_id text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  with target as (
    select c.* from public.categories c where c.id = p_category_id and c.is_active
  ),
  branch as (
    select c.id from public.categories c, target t
     where c.id = t.id or c.parent_id = t.id
  ),
  progress as (
    select coalesce(sum(uc.mastery_score), 0)::int as mastery,
           coalesce(max(uc.level), 1)::int         as level,
           coalesce(max(uc.interest_weight), 0)::numeric as weight,
           coalesce(max(uc.difficulty_pref), 2)::int as difficulty_pref
      from public.user_categories uc
     where uc.user_id = auth.uid() and uc.category_id in (select id from branch)
  )
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.display_name,
    'description', t.description, 'emoji', t.emoji, 'accent', t.accent_hex,
    'levelable', t.is_levelable, 'max_level', t.max_level,
    'level', p.level, 'mastery', p.mastery,
    'difficulty_pref', p.difficulty_pref,
    'is_following', p.weight > 1.0,
    'mastery_for_next',
      case when p.level >= t.max_level then null
           else ceil(100.0 * power(p.level::numeric, 1.6))::int end,
    'cards_total', (
      select count(*) from public.content_items ci
       where ci.status = 'approved' and ci.primary_category_id in (select id from branch)
         and (ci.expires_at is null or ci.expires_at > now())
    ),
    'cards_read', (
      select count(*) from public.user_content_state ucs
        join public.content_items ci on ci.id = ucs.content_id
       where ucs.user_id = auth.uid() and ucs.is_read_validated
         and ci.primary_category_id in (select id from branch)
    ),
    'children', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'slug', c.slug, 'name', c.display_name, 'emoji', c.emoji
             ) order by c.sort_order), '[]'::jsonb)
        from public.categories c, target t2
       where c.parent_id = t2.id and c.is_active
    )
  ) into v_out
  from target t, progress p;

  if v_out is null then
    raise exception 'unknown category: %', p_category_id;
  end if;
  return v_out;
end
$fn$;
grant execute on function public.get_category_detail(text) to authenticated;


-- =============================================================================
-- TEIL 2 · Einstellungen
-- =============================================================================

alter table public.profiles
  -- Ab dieser Zahl bietet die App das Aufhoeren an. Pro Konto einstellbar,
  -- Standard aus app_config.limits.enough_for_today_at.
  add column if not exists daily_goal_cards smallint not null default 60
    check (daily_goal_cards between 10 and 500),
  add column if not exists notify_reviews boolean not null default true,
  add column if not exists notify_streak boolean not null default true;


create or replace function public.update_my_settings(p_patch jsonb)
returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_out  public.profiles;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Nur diese Felder sind aenderbar. birth_year und handle bleiben aussen vor:
  -- das Geburtsjahr steuert das Alters-Gate, das Handle ist die oeffentliche
  -- Identitaet auf der Rangliste.
  update public.profiles set
    display_name       = coalesce(p_patch->>'display_name', display_name),
    language           = coalesce(nullif(p_patch->>'language', ''), language),
    country_code       = coalesce(nullif(p_patch->>'country_code', ''), country_code),
    region_code        = case when p_patch ? 'region_code'
                              then nullif(p_patch->>'region_code', '')
                              else region_code end,
    timezone           = coalesce(nullif(p_patch->>'timezone', ''), timezone),
    leaderboard_opt_in = coalesce((p_patch->>'leaderboard_opt_in')::boolean, leaderboard_opt_in),
    daily_goal_cards   = coalesce((p_patch->>'daily_goal_cards')::smallint, daily_goal_cards),
    notify_reviews     = coalesce((p_patch->>'notify_reviews')::boolean, notify_reviews),
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;
grant execute on function public.update_my_settings(jsonb) to authenticated;


-- =============================================================================
-- DSGVO Art. 15 · Auskunft: alles, was wir ueber den Nutzer gespeichert haben
-- =============================================================================

create or replace function public.export_my_data()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'exported_at', now(),
    'profile',     (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'categories',  (select coalesce(jsonb_agg(to_jsonb(uc)), '[]'::jsonb)
                      from public.user_categories uc where uc.user_id = auth.uid()),
    'reading',     (select coalesce(jsonb_agg(to_jsonb(ucs)), '[]'::jsonb)
                      from public.user_content_state ucs where ucs.user_id = auth.uid()),
    'xp_ledger',   (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                      from public.xp_ledger l where l.user_id = auth.uid()),
    'reviews',     (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                      from public.review_queue r where r.user_id = auth.uid()),
    'achievements',(select coalesce(jsonb_agg(to_jsonb(ua)), '[]'::jsonb)
                      from public.user_achievements ua where ua.user_id = auth.uid()),
    'events_count',(select count(*) from public.content_events where user_id = auth.uid())
  );
$fn$;
grant execute on function public.export_my_data() to authenticated;


-- =============================================================================
-- DSGVO Art. 17 · Loeschung
--
-- Loescht den Auth-Eintrag; alles andere haengt per ON DELETE CASCADE daran.
-- Muss in der App erreichbar sein, nicht nur per Mail an den Betreiber - und
-- bei einer Zielgruppe ab 13 Jahren ist das keine Formalie.
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = v_user;
end
$fn$;
grant execute on function public.delete_my_account() to authenticated;
