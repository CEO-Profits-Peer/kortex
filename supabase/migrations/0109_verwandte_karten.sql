-- =============================================================================
-- 0109_verwandte_karten.sql  ·  "Dazu passt": Karten-Zusammenhaenge
--
-- Zu einer Handvoll Karten die naechsten ungelesenen Karten nach Bedeutung -
-- ueber die Embeddings, die die Pipeline ohnehin fuer das Dedup schreibt
-- (0046, ivfflat-Index). Kein Modellaufruf, keine neue Tabelle.
--
-- Nur Karten in den eigenen Feed-Sprachen (user_feed_languages, 0029) und
-- nichts, was man schon gelesen hat - "Dazu passt" soll weiterfuehren, nicht
-- wiederholen (dafuer gibt es /review).
--
-- operator(public.<=>): mit search_path = '' findet Postgres den Operator
-- sonst nicht (0046, dort ausfuehrlich).
-- =============================================================================

create or replace function public.verwandte_karten(p_ids uuid[], p_n int default 3)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with basis as (
    select embedding from public.content_items
     where id = any (p_ids[1:10]) and embedding is not null
  ),
  kandidaten as (
    select ci.id, ci.title, ci.primary_category_id,
           min(ci.embedding operator(public.<=>) b.embedding) as abstand
      from public.content_items ci
      cross join basis b
     where ci.status = 'approved'
       and ci.embedding is not null
       and not (ci.id = any (p_ids))
       and ci.language = any (public.user_feed_languages(auth.uid()))
       and not exists (select 1 from public.user_content_state s
                        where s.user_id = auth.uid() and s.content_id = ci.id and s.is_read_validated)
     group by ci.id, ci.title, ci.primary_category_id
     order by abstand
     limit greatest(1, least(coalesce(p_n, 3), 6))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'content_id', id, 'title', title, 'category', primary_category_id
         ) order by abstand), '[]'::jsonb)
    from kandidaten;
$fn$;
revoke execute on function public.verwandte_karten(uuid[], int) from anon;
grant execute on function public.verwandte_karten(uuid[], int) to authenticated;

do $test$
declare
  v_id uuid;
  v_k  uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  select id into v_k from public.content_items where status = 'approved' and embedding is not null limit 1;
  if v_id is null or v_k is null then raise notice 'Selbsttest 0109: zu wenig Daten'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  v_j := public.verwandte_karten(array[v_k], 3);
  raise notice 'Selbsttest 0109: % verwandte Karten', jsonb_array_length(v_j);
end
$test$;

notify pgrst, 'reload schema';
