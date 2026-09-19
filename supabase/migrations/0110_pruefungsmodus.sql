-- =============================================================================
-- 0110_pruefungsmodus.sql  ·  Pruefungsmodus: bis zum Tag X sitzt alles
--
-- Man legt eine Pruefung an (Titel, Datum, Themen). Die App zeigt dann:
-- wie viele Tage noch, wie viele Karten der Themen gelesen und wie viele
-- "sicher" sind (mind. zweimal richtig wiederholt), und ein Tagesziel, das
-- den Rest gleichmaessig auf die Tage bis zur Pruefung verteilt.
--
-- "Fuer die Pruefung wiederholen" zieht Wiederholungen dieser Themen VOR,
-- auch wenn sie laut Plan erst nach der Pruefung dran waeren - das ist der
-- ganze Zweck. Aber: vorgezogene Antworten bringen KEINE XP und aendern
-- den normalen Plan nicht (ausser bei falscher Antwort: dann kommt die Frage
-- morgen wieder). Sonst liesse sich ueber den Pruefungsmodus Mastery - und
-- damit Meisterwege und Ligen - beliebig schnell hochziehen. Ist eine
-- Wiederholung ohnehin faellig, laeuft sie ganz normal ueber submit_review.
--
-- Themen: Kategorie-IDs; eine Wurzel ("science") umfasst ihre Blaetter.
-- Hoechstens 5 offene Pruefungen, Datum heute bis in 180 Tagen.
-- =============================================================================

create table if not exists public.pruefungen (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  titel      text not null check (length(btrim(titel)) between 2 and 60),
  datum      date not null,
  kategorien text[] not null check (cardinality(kategorien) between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists pruefungen_user_idx on public.pruefungen (user_id, datum);
alter table public.pruefungen enable row level security;
revoke all on public.pruefungen from anon, authenticated;

-- Gehoert eine Kategorie zu einer der gewaehlten? (Wurzel umfasst Blaetter.)
create or replace function public.pruefung_passt(p_kat text, p_auswahl text[])
returns boolean
language sql immutable set search_path = ''
as $fn$
  select exists (select 1 from unnest(p_auswahl) a where p_kat = a or p_kat like a || '.%');
$fn$;

create or replace function public.pruefung_anlegen(p_titel text, p_datum date, p_kategorien text[])
returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if p_datum < current_date or p_datum > current_date + 180 then
    raise exception 'Das Datum muss zwischen heute und in einem halben Jahr liegen';
  end if;
  if (select count(*) from public.pruefungen where user_id = v_me and datum >= current_date) >= 5 then
    raise exception 'Höchstens fünf offene Prüfungen';
  end if;
  if public.post_rejection(coalesce(p_titel, '')) is not null then raise exception 'Dieser Titel geht nicht'; end if;
  if exists (select 1 from unnest(p_kategorien) k
              where not exists (select 1 from public.categories c where c.id = k and c.is_active)) then
    raise exception 'Unbekanntes Thema';
  end if;
  insert into public.pruefungen (user_id, titel, datum, kategorien)
  values (v_me, btrim(p_titel), p_datum, p_kategorien) returning id into v_id;
  return v_id;
end
$fn$;

create or replace function public.pruefung_loeschen(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.pruefungen where id = p_id and user_id = auth.uid();
$fn$;

create or replace function public.meine_pruefungen()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x order by (x->>'datum')), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', p.id, 'titel', p.titel, 'datum', p.datum, 'kategorien', p.kategorien,
               'tage', greatest(0, p.datum - current_date),
               'gesamt', k.gesamt, 'gelesen', k.gelesen,
               'sicher', r.sicher, 'offen', r.offen,
               -- Was noch fehlt (ungelesen + nicht sicher), gleichmaessig
               -- auf die verbleibenden Tage (mind. 1) verteilt.
               'heute', ceil(((k.gesamt - k.gelesen) + (r.offen - r.sicher))::numeric
                             / greatest(1, p.datum - current_date))::int
             ) as x
        from public.pruefungen p
        cross join lateral (
          select count(*)::int as gesamt,
                 count(*) filter (where exists (
                   select 1 from public.user_content_state s
                    where s.user_id = p.user_id and s.content_id = ci.id and s.is_read_validated))::int as gelesen
            from public.content_items ci
           where ci.status = 'approved'
             and ci.language = any (public.user_feed_languages(p.user_id))
             and public.pruefung_passt(ci.primary_category_id, p.kategorien)
        ) k
        cross join lateral (
          select count(*)::int as offen,
                 count(*) filter (where rq.is_retired or rq.repetitions >= 2)::int as sicher
            from public.review_queue rq
           where rq.user_id = p.user_id and public.pruefung_passt(rq.category_id, p.kategorien)
        ) r
       where p.user_id = auth.uid() and p.datum >= current_date - 1
    ) t;
$fn$;

-- Fragen fuer die Pruefung: faellige zuerst, dann vorgezogene. Was in den
-- letzten 20 Stunden schon dran war, bleibt draussen - Abstand ist der
-- Kern von Wiederholung, auch im Endspurt.
create or replace function public.pruefung_fragen(p_id uuid, p_limit int default 10)
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
  select rq.id, rq.content_id, rq.quiz_index, rq.category_id, c.display_name, c.accent_hex,
         ci.title, (ci.quiz_items -> rq.quiz_index ->> 'question'),
         (ci.quiz_items -> rq.quiz_index -> 'options'),
         rq.repetitions, rq.interval_days, rq.due_at
    from public.pruefungen p
    join public.review_queue rq on rq.user_id = p.user_id
    join public.content_items ci on ci.id = rq.content_id
    join public.categories c on c.id = rq.category_id
   where p.id = p_id and p.user_id = auth.uid()
     and not rq.is_retired
     and public.pruefung_passt(rq.category_id, p.kategorien)
     and (rq.last_reviewed is null or rq.last_reviewed < now() - interval '20 hours')
     and ci.status = 'approved'
     and ci.quiz_items -> rq.quiz_index is not null
   order by rq.due_at asc
   limit least(greatest(coalesce(p_limit, 10), 1), 30);
$fn$;

create or replace function public.pruefung_antworten(p_review uuid, p_answer smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_r    public.review_queue;
  v_quiz jsonb;
  v_ok   boolean;
begin
  select * into v_r from public.review_queue where id = p_review and user_id = auth.uid();
  if v_r.id is null then raise exception 'unknown review'; end if;

  -- Ohnehin faellig: der normale Weg, mit XP und Planaenderung.
  if v_r.due_at <= now() then
    return public.submit_review(p_review, p_answer);
  end if;

  select quiz_items -> v_r.quiz_index into v_quiz from public.content_items where id = v_r.content_id;
  v_ok := (v_quiz->>'correct_index')::smallint = p_answer;
  update public.review_queue
     set last_reviewed = now(),
         -- Falsch vor der Pruefung: morgen nochmal, egal was der Plan sagte.
         due_at = case when v_ok then due_at else least(due_at, now() + interval '1 day') end
   where id = p_review;
  return jsonb_build_object('correct', v_ok, 'correct_index', (v_quiz->>'correct_index')::smallint,
                            'xp', 0, 'vorgezogen', true);
end
$fn$;

revoke execute on function public.pruefung_anlegen(text, date, text[]), public.pruefung_loeschen(uuid),
  public.meine_pruefungen(), public.pruefung_fragen(uuid, int), public.pruefung_antworten(uuid, smallint) from anon;
grant execute on function public.pruefung_anlegen(text, date, text[]), public.pruefung_loeschen(uuid),
  public.meine_pruefungen(), public.pruefung_fragen(uuid, int), public.pruefung_antworten(uuid, smallint) to authenticated;

do $test$
declare
  v_id uuid;
  v_p  uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0110: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    v_p := public.pruefung_anlegen('Selbsttest Bio', current_date + 7, array['science']);
    v_j := public.meine_pruefungen();
    if jsonb_array_length(v_j) < 1 or (v_j->0->>'tage')::int <> 7 then
      raise exception 'Selbsttest 0110: Stand falsch: %', v_j;
    end if;
    perform count(*) from public.pruefung_fragen(v_p, 5);
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0110: ok';
end
$test$;

notify pgrst, 'reload schema';
