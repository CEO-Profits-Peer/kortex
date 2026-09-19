-- =============================================================================
-- 0113_klassen_ueberblick.sql  ·  Klassen-Modus: wo hakt es in der Gruppe?
--
-- Baut auf den Gruppen-Stapeln (0106) auf: wer einen Stapel angelegt hat -
-- etwa eine Lehrkraft -, sieht je Karte, wie viele aus der Gruppe sie
-- gelesen haben und wie oft die Quizfrage richtig beantwortet wurde.
--
-- ANONYM, und zwar so, dass es auch rechnerisch nicht aufgeht:
--   * keine Namen, keine Einzelwerte, nur Summen ueber die Gruppe;
--   * die eigene Person zaehlt nicht mit (sonst misst man sich selbst);
--   * eine Quote gibt es erst ab MIN_LEUTE (3) Personen, die geantwortet
--     haben - bei zweien koennte man aus der eigenen Kenntnis der einen auf
--     die andere schliessen. Darunter steht nur "zu wenige".
-- Die Mitglieder sehen im Stapel einen Hinweis darauf (App).
-- =============================================================================

create or replace function public.gs_klassenstand(p_stapel uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  c_min constant int := 3;
  v_s   public.gruppen_stapel;
  v_out jsonb;
begin
  select * into v_s from public.gruppen_stapel where id = p_stapel;
  if v_s.id is null or v_s.besitzer <> auth.uid() then raise exception 'Nur für die Person, die den Stapel angelegt hat'; end if;

  with leute as (
    select m.user_id from public.gruppen_stapel_mitglieder m
     where m.stapel_id = p_stapel and m.user_id <> v_s.besitzer
  ),
  je_karte as (
    select k.content_id, ci.title,
           count(ucs.user_id) filter (where ucs.is_read_validated)::int as gelesen,
           count(ucs.user_id) filter (where ucs.quiz_attempts > 0)::int as geantwortet,
           coalesce(sum(ucs.quiz_correct) filter (where ucs.quiz_attempts > 0), 0)::int as richtig,
           coalesce(sum(ucs.quiz_attempts) filter (where ucs.quiz_attempts > 0), 0)::int as versuche
      from public.gruppen_stapel_karten k
      join public.content_items ci on ci.id = k.content_id and ci.status = 'approved'
      left join public.user_content_state ucs
             on ucs.content_id = k.content_id and ucs.user_id in (select user_id from leute)
     where k.stapel_id = p_stapel
     group by k.content_id, ci.title, k.at
     order by k.at
  )
  select jsonb_build_object(
           'leute', (select count(*) from leute),
           'min', c_min,
           'karten', coalesce(jsonb_agg(jsonb_build_object(
               'content_id', j.content_id, 'title', j.title,
               'gelesen', j.gelesen,
               'geantwortet', j.geantwortet,
               'quote', case when j.geantwortet >= c_min and j.versuche > 0
                             then round(100.0 * j.richtig / j.versuche)::int end)), '[]'::jsonb))
    into v_out
    from je_karte j;
  return v_out;
end
$fn$;

revoke execute on function public.gs_klassenstand(uuid) from anon;
grant execute on function public.gs_klassenstand(uuid) to authenticated;

do $test$
declare
  v_a uuid;
  v_b uuid;
  v_k uuid;
  v_j jsonb;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  select id into v_k from public.content_items where status = 'approved' limit 1;
  if v_b is null or v_k is null then raise notice 'Selbsttest 0113: zu wenig Daten'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_j := public.gs_erstellen('Selbsttest Klasse');
    perform public.gs_karte((v_j->>'id')::uuid, v_k, true);
    v_j := public.gs_klassenstand((v_j->>'id')::uuid);
    if jsonb_array_length(v_j->'karten') <> 1 or (v_j->'karten'->0->'quote') <> 'null'::jsonb then
      raise exception 'Selbsttest 0113: %', v_j;
    end if;
    -- Fremde duerfen nicht.
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    begin
      perform public.gs_klassenstand((select id from public.gruppen_stapel where titel = 'Selbsttest Klasse'));
      raise exception 'Selbsttest 0113: Fremde sehen den Stand';
    exception when others then
      if sqlerrm like 'Selbsttest%' then raise; end if;
    end;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0113: ok';
end
$test$;

notify pgrst, 'reload schema';
