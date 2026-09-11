-- =============================================================================
-- 0022_daily_challenge.sql  ·  Die Tagesaufgabe
--
-- Warum das gebaut wird
-- --------------------
-- Der Feed hat kein Ende - und damit auch keinen Grund, morgen wiederzukommen.
-- Wer heute vierzig Karten gelesen hat, hat morgen nichts, worauf er sich
-- freut. Das ist der Unterschied zwischen einem Feed und einer Gewohnheit.
--
-- Die Tagesaufgabe ist der Gegenentwurf und funktioniert ueber drei Dinge,
-- die im endlosen Feed alle fehlen:
--
--   ENDE       Fuenf Fragen. Danach ist Schluss. Etwas abzuschliessen fuehlt
--              sich anders an als etwas zu unterbrechen.
--   GLEICHHEIT Alle bekommen DIESELBEN fuenf Fragen. Erst dadurch entsteht
--              ein Gespraech - "hattest du die vierte auch falsch?" gibt es
--              in einem personalisierten Feed nicht.
--   VERGLEICH  Eine Rangliste, die jeden Tag bei null anfaengt. Wer gestern
--              schlecht war, hat heute wieder eine Chance; wer gestern
--              gewonnen hat, muss es nochmal zeigen.
--
-- Warum das serverseitig sein MUSS
-- --------------------------------
-- Dieselben Gruende wie bei submit_quiz, nur schaerfer: hier gibt es eine
-- Rangliste, also einen Anreiz zu schummeln. Deshalb
--
--   · die richtige Antwort verlaesst nie den Server, bevor geantwortet wurde;
--   · gewertet wird serverseitig aus den Rohantworten;
--   · pro Tag und Konto genau ein Ergebnis (Primaerschluessel), kein zweiter
--     Versuch;
--   · die Zeit wird zwar mitgeschickt, aber gedeckelt und nur als
--     Stichentscheid benutzt - eine gefaelschte Zeit gewinnt damit nichts,
--     was sie nicht auch mit richtigen Antworten gewinnen wuerde.
-- =============================================================================


-- --- Welche Karten heute dran sind -----------------------------------------
create table if not exists public.daily_challenges (
  challenge_date date        not null,
  language       text        not null,
  content_ids    uuid[]      not null,
  created_at     timestamptz not null default now(),
  primary key (challenge_date, language)
);

comment on table public.daily_challenges is
  'Eine feste Fragenauswahl pro Tag und Sprache. Wird beim ersten Abruf des Tages angelegt und danach nie mehr geaendert - sonst haetten frueh und spaet gestartete Spieler verschiedene Aufgaben.';


-- --- Wer wie abgeschnitten hat ----------------------------------------------
create table if not exists public.daily_results (
  challenge_date date        not null,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  language       text        not null,
  correct        smallint    not null,
  total          smallint    not null,
  -- Nur Stichentscheid. Gedeckelt, damit eine manipulierte Zahl nichts bringt.
  duration_ms    int         not null,
  answers        smallint[]  not null,
  finished_at    timestamptz not null default now(),
  primary key (challenge_date, user_id)
);

create index if not exists daily_results_rank_idx
  on public.daily_results (challenge_date, language, correct desc, duration_ms asc);


alter table public.daily_challenges enable row level security;
alter table public.daily_results    enable row level security;

-- Kein direkter Zugriff. Alles laeuft ueber die Funktionen unten - die
-- Fragenauswahl darf nicht abrufbar sein, ohne dass die Antworten entfernt
-- wurden.
revoke all on public.daily_challenges from anon, authenticated;
revoke all on public.daily_results    from anon, authenticated;
grant all on public.daily_challenges to service_role;
grant all on public.daily_results    to service_role;


-- =============================================================================
-- Die Auswahl des Tages
--
-- Deterministisch aus dem Datum: derselbe Tag ergibt dieselben Karten, auch
-- wenn die Funktion zweimal gleichzeitig laeuft. Ohne das koennten zwei
-- Nutzer, die in derselben Sekunde starten, verschiedene Aufgaben bekommen -
-- und die Rangliste waere wertlos.
--
-- Bedingungen an eine Tagesfrage:
--   · freigegeben und in der richtigen Sprache
--   · hat mindestens eine Quizfrage
--   · nicht aus dem Demo-Bestand
--   · nicht aelter als 90 Tage - Aktualitaet ist Teil des Reizes
-- =============================================================================
create or replace function public.ensure_daily_challenge(p_language text, p_date date)
returns uuid[]
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ids uuid[];
begin
  select content_ids into v_ids
    from public.daily_challenges
   where challenge_date = p_date and language = p_language;

  if v_ids is not null then
    return v_ids;
  end if;

  select array_agg(id order by ord) into v_ids
  from (
    select ci.id,
           -- Datum in den Hash: eine feste, aber jeden Tag andere Reihenfolge.
           md5(ci.id::text || p_date::text) as ord
      from public.content_items ci
     where ci.status = 'approved'
       and ci.language = p_language
       and jsonb_array_length(ci.quiz_items) > 0
       and coalesce((ci.media ->> 'demo')::boolean, false) = false
       and ci.created_at > now() - interval '90 days'
     order by md5(ci.id::text || p_date::text)
     limit 5
  ) t;

  -- Zu wenig frischer Stoff? Dann ohne Altersgrenze. Eine Tagesaufgabe mit
  -- aelteren Karten ist besser als gar keine - und am Anfang ist genau das
  -- der Normalfall.
  if v_ids is null or array_length(v_ids, 1) < 5 then
    select array_agg(id order by ord) into v_ids
    from (
      select ci.id, md5(ci.id::text || p_date::text) as ord
        from public.content_items ci
       where ci.status = 'approved'
         and ci.language = p_language
         and jsonb_array_length(ci.quiz_items) > 0
       order by md5(ci.id::text || p_date::text)
       limit 5
    ) t;
  end if;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return null;
  end if;

  insert into public.daily_challenges (challenge_date, language, content_ids)
  values (p_date, p_language, v_ids)
  -- Zwei gleichzeitige erste Abrufe: der zweite nimmt, was der erste
  -- geschrieben hat.
  on conflict (challenge_date, language) do nothing;

  select content_ids into v_ids
    from public.daily_challenges
   where challenge_date = p_date and language = p_language;

  return v_ids;
end
$fn$;

revoke execute on function public.ensure_daily_challenge(text, date) from anon, authenticated;


-- =============================================================================
-- Die Tagesaufgabe abrufen
--
-- Liefert die Fragen OHNE correct_index. Das ist keine Vorsichtsmassnahme,
-- sondern die Grundlage: waere die Antwort dabei, koennte man sie im
-- Netzwerkverkehr mitlesen, und die Rangliste waere eine Liste derer, die
-- die Entwicklerwerkzeuge kennen.
-- =============================================================================
create or replace function public.get_daily_challenge()
returns jsonb
language plpgsql stable security definer set search_path = ''
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


-- =============================================================================
-- Abgeben
--
-- Einmal pro Tag. Der zweite Versuch bekommt das erste Ergebnis zurueck statt
-- einer Fehlermeldung: aus Sicht des Nutzers ist "du hast heute schon
-- gespielt" keine Stoerung, sondern eine Auskunft.
-- =============================================================================
create or replace function public.submit_daily(
  p_answers     smallint[],
  p_duration_ms int
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me      uuid := auth.uid();
  v_lang    text;
  v_today   date := (now() at time zone 'UTC')::date;
  v_ids     uuid[];
  v_correct int := 0;
  v_total   int;
  v_dur     int;
  v_detail  jsonb;
  v_exists  jsonb;
  v_xp      int;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;

  select jsonb_build_object(
           'correct', r.correct, 'total', r.total,
           'duration_ms', r.duration_ms, 'repeat', true
         ) into v_exists
    from public.daily_results r
   where r.challenge_date = v_today and r.user_id = v_me;
  if v_exists is not null then
    return v_exists;
  end if;

  select coalesce(p.language, 'de') into v_lang
    from public.profiles p where p.id = v_me;

  select content_ids into v_ids
    from public.daily_challenges
   where challenge_date = v_today and language = v_lang;
  if v_ids is null then raise exception 'keine Tagesaufgabe'; end if;

  v_total := array_length(v_ids, 1);
  if array_length(p_answers, 1) is distinct from v_total then
    raise exception 'erwarte % Antworten', v_total;
  end if;

  -- Deckeln: unter zwei Sekunden pro Frage hat niemand gelesen, ueber zehn
  -- Minuten hat jemand das Handy weggelegt. Beides zaehlt als Randwert.
  v_dur := least(greatest(coalesce(p_duration_ms, 0), v_total * 2000), 600000);

  select jsonb_agg(jsonb_build_object(
           'content_id',    ci.id,
           'correct_index', (ci.quiz_items -> 0 ->> 'correct_index')::int,
           'chosen',        p_answers[ord.n],
           'ok',            (ci.quiz_items -> 0 ->> 'correct_index')::int = p_answers[ord.n],
           'explanation',   ci.quiz_items -> 0 ->> 'explanation'
         ) order by ord.n)
    into v_detail
    from unnest(v_ids) with ordinality as ord(cid, n)
    join public.content_items ci on ci.id = ord.cid;

  select count(*) into v_correct
    from jsonb_array_elements(v_detail) e
   where (e ->> 'ok')::boolean;

  insert into public.daily_results
    (challenge_date, user_id, language, correct, total, duration_ms, answers)
  values (v_today, v_me, v_lang, v_correct, v_total, v_dur, p_answers);

  -- Punkte: pro richtiger Antwort etwas, fuer alle richtig deutlich mehr.
  -- Die Tagesaufgabe soll sich lohnen, ohne den normalen Feed zu entwerten.
  v_xp := v_correct * 12 + case when v_correct = v_total then 40 else 0 end;
  perform public.award_xp(
    v_me, v_xp, v_correct * 2, 'daily_challenge', null, 'daily', v_today::text
  );

  return jsonb_build_object(
    'correct',     v_correct,
    'total',       v_total,
    'xp',          v_xp,
    'duration_ms', v_dur,
    'detail',      v_detail,
    'repeat',      false
  );
end
$fn$;

grant execute on function public.submit_daily(smallint[], int) to authenticated;


-- =============================================================================
-- Die Tagesrangliste
--
-- Nach richtigen Antworten, bei Gleichstand nach Zeit. Nur wer die Rangliste
-- eingeschaltet hat, taucht auf - dieselbe Regel wie bei der Gesamtrangliste,
-- sonst waere die Einstellung eine Attrappe.
--
-- Der eigene Platz kommt immer mit, auch wenn er weit hinten liegt. Ohne das
-- sieht man nur die Spitze und weiss nicht, wo man selbst steht - und genau
-- das ist der Teil, der interessiert.
-- =============================================================================
create or replace function public.get_daily_leaderboard(p_limit int default 20)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_lang  text;
  v_rows  jsonb;
  v_mine  jsonb;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  select coalesce(p.language, 'de') into v_lang
    from public.profiles p where p.id = v_me;

  with ranked as (
    select r.user_id, r.correct, r.total, r.duration_ms,
           row_number() over (order by r.correct desc, r.duration_ms asc) as pos,
           p.handle, p.display_name, p.avatar_seed, p.avatar_path
      from public.daily_results r
      join public.profiles p on p.id = r.user_id
     where r.challenge_date = v_today
       and r.language = v_lang
       and p.leaderboard_opt_in
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
       'pos', pos, 'handle', handle,
       'display_name', coalesce(nullif(trim(display_name), ''), handle),
       'avatar_seed', avatar_seed, 'avatar_path', avatar_path,
       'correct', correct, 'total', total, 'duration_ms', duration_ms,
       'is_me', user_id = v_me
     ) order by pos), '[]'::jsonb)
       from ranked where pos <= p_limit),
    (select jsonb_build_object(
       'pos', pos, 'correct', correct, 'total', total, 'duration_ms', duration_ms)
       from ranked where user_id = v_me)
  into v_rows, v_mine;

  return jsonb_build_object(
    'date',    v_today,
    'rows',    v_rows,
    'me',      v_mine,
    'players', (select count(*) from public.daily_results
                 where challenge_date = v_today and language = v_lang)
  );
end
$fn$;

grant execute on function public.get_daily_leaderboard(int) to authenticated;
