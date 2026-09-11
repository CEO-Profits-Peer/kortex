-- =============================================================================
-- 0007_onboarding_stats.sql
--
-- Zwei RPCs, die die App ab jetzt braucht:
--   complete_onboarding()  Region, Geburtsjahr, Sprache und Interessen setzen
--   get_my_stats()         Profil + Kategorie-Aufschluesselung fuer den Radar
--
-- Warum als RPC und nicht als direkter UPDATE: birth_year und handle sind fuer
-- den Client per Spalten-Grant gesperrt (0002_rls.sql). Das ist Absicht - das
-- Geburtsjahr steuert das DSGVO-Alters-Gate und darf nicht nachtraeglich frei
-- editierbar sein.
-- =============================================================================

create or replace function public.complete_onboarding(
  p_country     text,
  p_region      text,
  p_birth_year  int,
  p_language    text,
  p_timezone    text,
  p_categories  text[]
) returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_out  public.profiles;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if p_birth_year < 1900 or p_birth_year > extract(year from now())::int then
    raise exception 'invalid birth year';
  end if;
  if array_length(p_categories, 1) is null or array_length(p_categories, 1) < 3 then
    raise exception 'at least 3 categories required';
  end if;

  update public.profiles
     set country_code            = coalesce(nullif(p_country, ''), country_code),
         region_code             = nullif(p_region, ''),
         birth_year              = p_birth_year::smallint,
         language                = coalesce(nullif(p_language, ''), language),
         timezone                = coalesce(nullif(p_timezone, ''), timezone),
         onboarding_completed_at = now()
   where id = v_user
  returning * into v_out;

  -- Gewaehlte Interessen hoch gewichten, den Rest auf neutral zuruecksetzen.
  -- Der Bootstrap aus 0006 hat alle Wurzelkategorien auf 1.0 gesetzt; nach dem
  -- Onboarding soll sich die Auswahl im Feed tatsaechlich bemerkbar machen.
  insert into public.user_categories (user_id, category_id, interest_weight, is_explicit)
  select v_user, c.id, 2.5, true
    from public.categories c
   where c.id = any(p_categories) and c.is_active
  on conflict (user_id, category_id) do update
    set interest_weight = 2.5,
        is_explicit     = true,
        updated_at      = now();

  update public.user_categories
     set interest_weight = 0.6, updated_at = now()
   where user_id = v_user
     and not (category_id = any(p_categories))
     and not is_explicit;

  return v_out;
end
$fn$;
grant execute on function public.complete_onboarding(text, text, int, text, text, text[])
  to authenticated;


-- =============================================================================
-- Stats fuer Profil und Wissens-Radar
-- =============================================================================

create or replace function public.get_my_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) - 'referral_code'
        from public.profiles p where p.id = auth.uid()
    ),
    'reviews_due', (
      select count(*) from public.review_queue
       where user_id = auth.uid() and not is_retired and due_at <= now()
    ),
    'read_today', (
      select count(*) from public.user_content_state ucs
       where ucs.user_id = auth.uid()
         and ucs.is_read_validated
         and ucs.last_seen_at >= date_trunc('day', now())
    ),
    -- Radar: nur Wurzelkategorien, damit das Spinnendiagramm lesbar bleibt.
    -- Unterkategorien zaehlen auf ihren Elternknoten ein.
    'radar', (
      select coalesce(jsonb_agg(r order by r->>'label'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id',      root.id,
                 'label',   root.display_name,
                 'emoji',   root.emoji,
                 'accent',  root.accent_hex,
                 'mastery', coalesce(sum(uc.mastery_score), 0),
                 'level',   coalesce(max(uc.level), 1)
               ) as r
          from public.categories root
          left join public.categories child
                 on child.id = root.id or child.parent_id = root.id
          left join public.user_categories uc
                 on uc.category_id = child.id and uc.user_id = auth.uid()
         where root.parent_id is null and root.is_active
         group by root.id, root.display_name, root.emoji, root.accent_hex
      ) t
    ),
    'recent_xp', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'kind', l.kind, 'xp', l.xp_amount,
               'mastery', l.mastery_amount, 'at', l.created_at
             ) order by l.created_at desc), '[]'::jsonb)
        from (select * from public.xp_ledger
               where user_id = auth.uid()
               order by created_at desc limit 20) l
    )
  );
$fn$;
grant execute on function public.get_my_stats() to authenticated;


-- =============================================================================
-- Batch-Bonus
--
-- Der Checkpoint vergibt einen Bonus, wenn alle Fragen eines Batches richtig
-- beantwortet wurden. Wird serverseitig vergeben, damit der Client ihn sich
-- nicht selbst gutschreiben kann; die Dedupe-Regel in xp_ledger verhindert,
-- dass derselbe Batch zweimal zaehlt.
-- =============================================================================

create or replace function public.claim_batch_bonus(
  p_content_ids uuid[],
  p_all_correct boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  v_key   text;
  v_ok    boolean;
  v_valid int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Nur Karten zaehlen, die der Server selbst als gelesen markiert hat.
  select count(*) into v_valid
    from public.user_content_state
   where user_id = v_user
     and content_id = any(p_content_ids)
     and is_read_validated;

  if v_valid < array_length(p_content_ids, 1) then
    return jsonb_build_object('granted', false, 'reason', 'not all validated');
  end if;

  -- Stabiler Schluessel aus den sortierten IDs: derselbe Batch, dieselbe Zeile.
  select md5(string_agg(x::text, ',' order by x)) into v_key
    from unnest(p_content_ids) x;

  v_ok := public.award_xp(
    v_user,
    case when p_all_correct then 50 else 0 end,
    case when p_all_correct then 10 else 0 end,
    'batch_bonus', null, 'batch', v_key
  );

  return jsonb_build_object('granted', v_ok, 'xp', case when p_all_correct then 50 else 0 end);
end
$fn$;
grant execute on function public.claim_batch_bonus(uuid[], boolean) to authenticated;
