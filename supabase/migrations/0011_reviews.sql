-- =============================================================================
-- 0011_reviews.sql  ·  Wiederholungen abrufen
--
-- submit_review() gibt es seit 0003. Was fehlte: eine Moeglichkeit, die
-- faelligen Fragen ueberhaupt zu bekommen.
--
-- Kritisch dabei: correct_index darf NICHT mitkommen. Eine Wiederholung, bei
-- der die richtige Antwort im Netzwerk-Payload steht, ist wertlos. Die
-- Funktion liefert nur Frage und Optionen; geprueft wird ausschliesslich in
-- submit_review().
-- =============================================================================

create or replace function public.get_due_reviews(p_limit int default 10)
returns table (
  review_id     uuid,
  content_id    uuid,
  quiz_index    smallint,
  category_id   text,
  category_name text,
  accent_hex    text,
  source_title  text,
  question      text,
  options       jsonb,
  repetitions   smallint,
  interval_days smallint,
  due_at        timestamptz
)
language sql stable security definer set search_path = ''
as $fn$
  select
    rq.id,
    rq.content_id,
    rq.quiz_index,
    rq.category_id,
    c.display_name,
    c.accent_hex,
    ci.title,
    (ci.quiz_items -> rq.quiz_index ->> 'question'),
    -- Nur die Optionen. correct_index und explanation bleiben auf dem Server,
    -- bis der Nutzer geantwortet hat.
    (ci.quiz_items -> rq.quiz_index -> 'options'),
    rq.repetitions,
    rq.interval_days,
    rq.due_at
  from public.review_queue rq
  join public.content_items ci on ci.id = rq.content_id
  join public.categories c     on c.id = rq.category_id
 where rq.user_id = auth.uid()
   and not rq.is_retired
   and rq.due_at <= now()
   and ci.status = 'approved'
   and ci.quiz_items -> rq.quiz_index is not null
 -- Aelteste Faelligkeit zuerst: was am laengsten wartet, ist am naechsten
 -- am Vergessen.
 order by rq.due_at asc
 limit p_limit;
$fn$;
grant execute on function public.get_due_reviews(int) to authenticated;


-- =============================================================================
-- Vorschau fuer den Profil-Tab: wann kommt die naechste Wiederholung?
-- =============================================================================

create or replace function public.get_review_summary()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'due_now', (
      select count(*) from public.review_queue
       where user_id = auth.uid() and not is_retired and due_at <= now()
    ),
    'due_today', (
      select count(*) from public.review_queue
       where user_id = auth.uid() and not is_retired
         and due_at <= date_trunc('day', now()) + interval '1 day'
    ),
    'next_due_at', (
      select min(due_at) from public.review_queue
       where user_id = auth.uid() and not is_retired and due_at > now()
    ),
    'in_rotation', (
      select count(*) from public.review_queue
       where user_id = auth.uid() and not is_retired
    ),
    'retired', (
      select count(*) from public.review_queue
       where user_id = auth.uid() and is_retired
    )
  );
$fn$;
grant execute on function public.get_review_summary() to authenticated;
