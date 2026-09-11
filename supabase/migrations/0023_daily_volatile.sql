-- =============================================================================
-- 0023_daily_volatile.sql  ·  get_daily_challenge darf schreiben
--
-- Der Fehler beim ersten Aufruf:
--
--     25006  cannot execute INSERT in a read-only transaction
--
-- Ursache: get_daily_challenge war `stable` deklariert. PostgREST nimmt das
-- beim Wort und oeffnet fuer solche Funktionen eine Nur-Lese-Transaktion.
-- Die Funktion legt aber beim ersten Abruf des Tages die Fragenauswahl an -
-- genau das ist ihr Sinn, und genau das geht in einer Nur-Lese-Transaktion
-- nicht.
--
-- `stable` war hier schlicht falsch: eine Funktion, die unter Umstaenden
-- eine Zeile schreibt, ist nicht stabil. Der Standard (volatile) ist richtig.
--
-- Die Alternative waere, die Tagesauswahl per Cron vorzubereiten. Das waere
-- aufgeraeumter, braucht aber einen zusaetzlichen laufenden Dienst - und
-- faellt der aus, gibt es keine Tagesaufgabe. Beim ersten Abruf anzulegen
-- kann dagegen nicht ausfallen: wer fragt, loest es aus.
-- =============================================================================

create or replace function public.get_daily_challenge()
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_lang  text;
  v_today date := (now() at time zone 'UTC')::date;
  v_ids   uuid[];
  v_done  jsonb;
  v_out   jsonb;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;

  select coalesce(p.language, 'de') into v_lang
    from public.profiles p where p.id = v_me;

  v_ids := public.ensure_daily_challenge(v_lang, v_today);
  if v_ids is null then
    return jsonb_build_object('date', v_today, 'available', false);
  end if;

  select jsonb_build_object(
           'correct', r.correct,
           'total', r.total,
           'duration_ms', r.duration_ms,
           'answers', r.answers,
           'finished_at', r.finished_at
         ) into v_done
    from public.daily_results r
   where r.challenge_date = v_today and r.user_id = v_me;

  select jsonb_build_object(
    'date',      v_today,
    'available', true,
    'language',  v_lang,
    'result',    v_done,
    'questions', coalesce(jsonb_agg(q order by (q->>'pos')::int), '[]'::jsonb)
  ) into v_out
  from (
    select jsonb_build_object(
      'pos',        ord.n,
      'content_id', ci.id,
      'title',      ci.title,
      'deck',       ci.deck,
      'category',   ci.primary_category_id,
      'difficulty', ci.difficulty,
      'question',   ci.quiz_items -> 0 ->> 'question',
      -- Nur die Optionen. Kein correct_index, keine explanation.
      'options',    ci.quiz_items -> 0 -> 'options'
    ) as q
      from unnest(v_ids) with ordinality as ord(cid, n)
      join public.content_items ci on ci.id = ord.cid
  ) t;

  return v_out;
end
$fn$;

grant execute on function public.get_daily_challenge() to authenticated;
