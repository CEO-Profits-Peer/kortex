-- =============================================================================
-- 0069_duels.sql  ·  Duelle: dieselben fuenf Karten, dieselbe Minute
--
-- Ein Quizduell zwischen zwei Leuten hat ein Fairness-Problem, das man nicht
-- wegdesignen kann, solange die Fragen aus dem Bestand kommen: wer mehr
-- gelesen hat, gewinnt. Das ist kein Duell, das ist eine Rangliste mit
-- Extraschritten.
--
-- Deshalb dieser Ablauf:
--
--   1. LERNEN   fuenf Karten, EINE Minute, fuer beide dieselben.
--   2. FRAGEN   fuenf Fragen dazu, 20 Sekunden je Frage.
--   3. ERGEBNIS mehr richtig gewinnt; bei Gleichstand die kuerzere Zeit.
--
-- Damit ist das Duell fair KONSTRUIERT und nicht nur fair gemeint: beide
-- bekommen dasselbe Material, dieselbe Zeit und dieselben Fragen. Wer vorher
-- mehr wusste, hat keinen Vorsprung - es geht um die eine Minute.
--
-- Die Kartenauswahl geht noch einen Schritt weiter: es werden bevorzugt
-- Karten genommen, die KEINER von beiden schon gesehen hat. Und niemals
-- welche, die genau einer gesehen hat - das waere der Vorsprung, den der
-- ganze Aufbau vermeiden soll. Reicht das Ungesehene nicht, kommen Karten
-- dran, die BEIDE kennen; auch das ist gleich.
--
-- Warum die Zeit hier steht und nicht im Bildschirm
-- ------------------------------------------------
-- Eine Stoppuhr in JavaScript ist eine Stoppuhr auf einem fremden Geraet. Wer
-- gewinnen will, oeffnet die Entwicklerwerkzeuge und haelt sie an. Deshalb
-- stempelt der Server, wann die Karten geholt wurden und wann die Fragen -
-- und rechnet beim Abgeben selbst nach. Der Bildschirm zeigt eine Uhr, aber
-- er entscheidet nichts.
--
-- Und die Loesungen gehen nie mit: `duel_cards` liefert die Karten OHNE
-- quiz_items, `duel_questions` die Fragen ohne correct_index. Das ist
-- dieselbe Regel wie im Feed - wer die richtige Antwort im Netzwerkverkehr
-- findet, braucht keine Minute.
--
-- Was ein Duell NICHT kann: Punkte kosten. Der Verlierer verliert nichts.
-- Ein Spiel, das einen zurueckwerfen kann, spielt man zweimal und nie wieder.
-- =============================================================================

-- --- Zeitbudget, an einer Stelle ---------------------------------------------
--
-- Als Funktionen und nicht als Konstanten im Code: sie werden an drei Stellen
-- gebraucht (Ausliefern, Abgeben, Anzeigen), und drei Kopien einer Zahl sind
-- zwei zu viel.
create or replace function public.duel_study_seconds() returns int
language sql immutable as $fn$ select 60 $fn$;

create or replace function public.duel_quiz_seconds() returns int
language sql immutable as $fn$ select 100 $fn$;   -- 5 Fragen a 20 Sekunden

-- Nachsicht fuer Netz und Bildaufbau. Wer in der U-Bahn spielt, soll nicht
-- verlieren, weil die Antwort zwei Sekunden unterwegs war.
create or replace function public.duel_grace_seconds() returns int
language sql immutable as $fn$ select 15 $fn$;


create table if not exists public.duels (
  id          uuid primary key default gen_random_uuid(),
  challenger  uuid not null references public.profiles(id) on delete cascade,
  opponent    uuid not null references public.profiles(id) on delete cascade,
  --: Genau fuenf, fuer beide dieselben, in derselben Reihenfolge.
  content_ids uuid[] not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  check (challenger <> opponent),
  check (array_length(content_ids, 1) = 5)
);
create index if not exists duels_challenger_idx on public.duels (challenger, created_at desc);
create index if not exists duels_opponent_idx   on public.duels (opponent, created_at desc);

create table if not exists public.duel_plays (
  duel_id          uuid not null references public.duels(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  --: Wann die Karten geholt wurden. Ab hier laeuft die Minute.
  study_started_at timestamptz,
  --: Wann die Fragen geholt wurden. Ab hier laufen die 100 Sekunden.
  quiz_started_at  timestamptz,
  finished_at      timestamptz,
  answers          smallint[],
  correct          smallint,
  elapsed_ms       int,
  primary key (duel_id, user_id)
);

alter table public.duels      enable row level security;
alter table public.duel_plays enable row level security;

-- Kein direkter Zugriff. ALLES laeuft ueber die Funktionen unten - sonst
-- koennte man content_ids lesen und die Karten samt quiz_items vorher
-- nachschlagen.
revoke all on public.duels      from anon, authenticated;
revoke all on public.duel_plays from anon, authenticated;


-- =============================================================================
-- Ein Duell beginnen
-- =============================================================================
create or replace function public.duel_start(p_opponent uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_langs text[];
  v_ids   uuid[];
  v_duel  uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_opponent is null or p_opponent = v_me then
    raise exception 'kein Gegner';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent) then
    raise exception 'kein Gegner';
  end if;

  -- Nur gegen Leute, denen man folgt. Ein Duell ist eine Einladung; von
  -- Fremden ist eine Einladung eine Nachricht, und Nachrichten von Fremden
  -- sind ein eigenes Problem mit eigenen Pflichten.
  if not exists (
    select 1 from public.follows f
     where f.follower_id = v_me and f.followee_id = p_opponent
  ) then
    raise exception 'nur gegen Leute, denen du folgst';
  end if;

  -- Ein offenes Duell je Paarung reicht.
  if exists (
    select 1 from public.duels d
     where d.expires_at > now()
       and ((d.challenger = v_me and d.opponent = p_opponent)
         or (d.challenger = p_opponent and d.opponent = v_me))
       and not exists (
         select 1 from public.duel_plays p
          where p.duel_id = d.id and p.finished_at is not null
            and p.user_id = v_me)
  ) then
    raise exception 'ihr habt schon ein offenes Duell';
  end if;

  -- Eine Sprache, die beide lesen. Ohne Schnittmenge kein Duell - eine
  -- Karte, die einer von beiden nicht lesen kann, ist kein Wettkampf.
  select array(
    select unnest(public.user_feed_languages(v_me))
    intersect
    select unnest(public.user_feed_languages(p_opponent))
  ) into v_langs;
  if coalesce(array_length(v_langs, 1), 0) = 0 then
    raise exception 'keine gemeinsame Sprache';
  end if;

  -- Fuenf Karten mit Frage, die entweder BEIDE oder KEINER kennt.
  -- Ungesehene zuerst: dann entscheidet wirklich nur die eine Minute.
  --
  -- Die Bedingung `(a is null) = (b is null)` ist der ganze Fairnesstrick:
  -- eine Karte kommt nur in Frage, wenn BEIDE sie kennen oder KEINER. Was
  -- genau einer gesehen hat, faellt raus - das waere der Vorsprung, den
  -- dieser ganze Aufbau vermeiden soll.
  --
  -- Sortiert wird in der Unterabfrage, nicht aussen: ein LIMIT ohne ORDER BY
  -- daneben nimmt irgendwelche fuenf, und dann waere "ungesehene zuerst" eine
  -- Absichtserklaerung ohne Wirkung.
  select array_agg(k.id) into v_ids
  from (
    select ci.id
      from public.content_items ci
      left join public.user_content_state a
             on a.content_id = ci.id and a.user_id = v_me
      left join public.user_content_state b
             on b.content_id = ci.id and b.user_id = p_opponent
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and jsonb_array_length(coalesce(ci.quiz_items, '[]'::jsonb)) > 0
       and (a.content_id is null) = (b.content_id is null)
     order by (a.content_id is null and b.content_id is null) desc, random()
     limit 5
  ) k;

  if coalesce(array_length(v_ids, 1), 0) < 5 then
    raise exception 'nicht genug gemeinsame Karten';
  end if;

  insert into public.duels (challenger, opponent, content_ids)
  values (v_me, p_opponent, v_ids)
  returning id into v_duel;

  return v_duel;
end
$fn$;

revoke execute on function public.duel_start(uuid) from anon;
grant  execute on function public.duel_start(uuid) to authenticated;


-- =============================================================================
-- Die Lernphase: fuenf Karten, eine Minute
--
-- Der erste Aufruf stempelt den Start. Jeder weitere liefert dieselben Karten
-- und die verbleibende Zeit - wer die Seite neu laedt, bekommt die Minute
-- also nicht noch einmal. Ist sie um, kommen keine Karten mehr.
-- =============================================================================
create or replace function public.duel_cards(p_duel uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_d    public.duels;
  v_play public.duel_plays;
  v_rest int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_d from public.duels where id = p_duel;
  if v_d.id is null or v_me not in (v_d.challenger, v_d.opponent) then
    raise exception 'kein Duell';
  end if;
  if v_d.expires_at <= now() then raise exception 'abgelaufen'; end if;

  insert into public.duel_plays (duel_id, user_id, study_started_at)
  values (p_duel, v_me, now())
  -- In ON CONFLICT heisst die Zieltabelle ohne Schema; `public.duel_plays`
  -- waere hier ein Fehler, kein Feinschliff.
  on conflict (duel_id, user_id) do update
    set study_started_at = coalesce(duel_plays.study_started_at, now())
  returning * into v_play;

  if v_play.finished_at is not null then raise exception 'schon gespielt'; end if;

  v_rest := public.duel_study_seconds()
            - floor(extract(epoch from (now() - v_play.study_started_at)))::int;

  -- Vorbei ist vorbei. Die Karten kommen nicht noch einmal - genau das ist
  -- der Unterschied zwischen "eine Minute lernen" und "nachschlagen".
  if v_rest <= 0 then
    return jsonb_build_object('phase', 'quiz', 'seconds_left', 0, 'cards', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'phase', 'study',
    'seconds_left', v_rest,
    -- OHNE quiz_items. Wer die Loesung im Netzwerkverkehr findet, braucht
    -- keine Minute.
    'cards', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ci.id,
               'title', ci.title,
               'deck', ci.deck,
               'body_blocks', ci.body_blocks,
               'category', ci.primary_category_id
             ) order by k.ord), '[]'::jsonb)
      from unnest(v_d.content_ids) with ordinality as k(id, ord)
      join public.content_items ci on ci.id = k.id
    )
  );
end
$fn$;

revoke execute on function public.duel_cards(uuid) from anon;
grant  execute on function public.duel_cards(uuid) to authenticated;


-- =============================================================================
-- Die Fragen: ohne Loesung
-- =============================================================================
create or replace function public.duel_questions(p_duel uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_d    public.duels;
  v_play public.duel_plays;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_d from public.duels where id = p_duel;
  if v_d.id is null or v_me not in (v_d.challenger, v_d.opponent) then
    raise exception 'kein Duell';
  end if;
  if v_d.expires_at <= now() then raise exception 'abgelaufen'; end if;

  select * into v_play from public.duel_plays
   where duel_id = p_duel and user_id = v_me;
  if v_play.duel_id is null or v_play.study_started_at is null then
    raise exception 'erst die Karten ansehen';
  end if;
  if v_play.finished_at is not null then raise exception 'schon gespielt'; end if;

  if v_play.quiz_started_at is null then
    update public.duel_plays set quiz_started_at = now()
     where duel_id = p_duel and user_id = v_me
    returning * into v_play;
  end if;

  return jsonb_build_object(
    'seconds_left', greatest(0, public.duel_quiz_seconds()
                    - floor(extract(epoch from (now() - v_play.quiz_started_at)))::int),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'content_id', ci.id,
               'title', ci.title,
               'question', ci.quiz_items->0->>'question',
               -- Die Reihenfolge der Antworten bleibt, wie sie in der Karte
               -- steht: beide Spieler sollen dieselbe Liste sehen.
               'options', ci.quiz_items->0->'options'
             ) order by k.ord), '[]'::jsonb)
      from unnest(v_d.content_ids) with ordinality as k(id, ord)
      join public.content_items ci on ci.id = k.id
    )
  );
end
$fn$;

revoke execute on function public.duel_questions(uuid) from anon;
grant  execute on function public.duel_questions(uuid) to authenticated;


-- =============================================================================
-- Abgeben
--
-- Der Server rechnet nach: richtig zaehlen, Zeit pruefen, Ergebnis schreiben.
-- Wer zu spaet kommt, bekommt null Punkte - nicht, weil das haerter ist,
-- sondern weil eine Uhr, die man ueberziehen kann, keine Uhr ist. Die App
-- gibt von sich aus ab, wenn ihre eigene Uhr ablaeuft; wer trotzdem zu spaet
-- ist, war nicht in der App.
-- =============================================================================
create or replace function public.duel_submit(p_duel uuid, p_answers smallint[])
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me      uuid := auth.uid();
  v_d       public.duels;
  v_play    public.duel_plays;
  v_ms      int;
  v_spaet   boolean;
  v_richtig smallint := 0;
  v_i       int;
  v_lsg     smallint;
  v_andere  public.duel_plays;
  v_sieger  uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_d from public.duels where id = p_duel;
  if v_d.id is null or v_me not in (v_d.challenger, v_d.opponent) then
    raise exception 'kein Duell';
  end if;

  select * into v_play from public.duel_plays
   where duel_id = p_duel and user_id = v_me;
  if v_play.duel_id is null or v_play.quiz_started_at is null then
    raise exception 'noch nicht angefangen';
  end if;
  if v_play.finished_at is not null then raise exception 'schon abgegeben'; end if;

  v_ms    := floor(extract(epoch from (now() - v_play.quiz_started_at)) * 1000)::int;
  v_spaet := v_ms > (public.duel_quiz_seconds() + public.duel_grace_seconds()) * 1000;

  if not v_spaet then
    for v_i in 1 .. array_length(v_d.content_ids, 1) loop
      select (ci.quiz_items->0->>'correct_index')::smallint into v_lsg
        from public.content_items ci where ci.id = v_d.content_ids[v_i];
      if v_lsg is not null
         and array_length(p_answers, 1) >= v_i
         and p_answers[v_i] = v_lsg then
        v_richtig := v_richtig + 1;
      end if;
    end loop;
  end if;

  update public.duel_plays
     set finished_at = now(),
         answers     = p_answers,
         correct     = v_richtig,
         elapsed_ms  = v_ms
   where duel_id = p_duel and user_id = v_me;

  -- Steht der andere schon fest, ist das Duell entschieden.
  select * into v_andere from public.duel_plays
   where duel_id = p_duel and user_id <> v_me and finished_at is not null;

  if v_andere.duel_id is not null then
    if v_richtig > v_andere.correct then
      v_sieger := v_me;
    elsif v_richtig < v_andere.correct then
      v_sieger := v_andere.user_id;
    elsif v_ms < v_andere.elapsed_ms then
      v_sieger := v_me;
    elsif v_ms > v_andere.elapsed_ms then
      v_sieger := v_andere.user_id;
    end if;

    -- Punkte gibt es nur nach oben. award_xp haelt ueber die Referenz selbst
    -- fest, dass je Duell und Person nur einmal etwas fliesst.
    if v_sieger is null then
      perform public.award_xp(v_me, 2, 0, 'duel_draw', null, 'duel', p_duel::text);
      perform public.award_xp(v_andere.user_id, 2, 0, 'duel_draw', null, 'duel', p_duel::text);
    else
      perform public.award_xp(v_sieger, 5, 0, 'duel_win', null, 'duel', p_duel::text);
    end if;
  end if;

  return jsonb_build_object(
    'correct', v_richtig,
    'total', array_length(v_d.content_ids, 1),
    'late', v_spaet,
    'elapsed_ms', v_ms,
    'waiting', v_andere.duel_id is null
  );
end
$fn$;

revoke execute on function public.duel_submit(uuid, smallint[]) from anon;
grant  execute on function public.duel_submit(uuid, smallint[]) to authenticated;


-- =============================================================================
-- Meine Duelle
-- =============================================================================
create or replace function public.duel_list()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  return (
    select coalesce(jsonb_agg(z order by erstellt desc), '[]'::jsonb) from (
      select d.created_at as erstellt,
             jsonb_build_object(
               'id', d.id,
               'gegner', jsonb_build_object(
                 'handle', g.handle,
                 'name', g.display_name,
                 'avatar_seed', g.avatar_seed,
                 'avatar_path', g.avatar_path
               ),
               'ich_habe_gestartet', d.challenger = v_me,
               'laeuft', d.expires_at > now(),
               'endet', d.expires_at,
               'mein_stand', case
                 when mein.finished_at is not null then 'fertig'
                 when mein.study_started_at is not null then 'laeuft'
                 else 'offen' end,
               'meine_punkte', mein.correct,
               'gegner_punkte', case
                 when mein.finished_at is not null then dein.correct else null end,
               'gegner_fertig', dein.finished_at is not null
             ) as z
        from public.duels d
        join public.profiles g
          on g.id = case when d.challenger = v_me then d.opponent else d.challenger end
        left join public.duel_plays mein
          on mein.duel_id = d.id and mein.user_id = v_me
        left join public.duel_plays dein
          on dein.duel_id = d.id and dein.user_id = g.id
       where v_me in (d.challenger, d.opponent)
       order by d.created_at desc
       limit 20
    ) q
  );
end
$fn$;

revoke execute on function public.duel_list() from anon;
grant  execute on function public.duel_list() to authenticated;
