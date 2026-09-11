-- =============================================================================
-- 0036_comments.sql  ·  Nachfragen zur Karte
--
-- Warum es das gibt
-- -----------------
-- Bei einer Karte ueber den Zinseszins steht die beste Frage nicht im Quiz,
-- sondern darunter: "Warum 72 und nicht 70?" Kommentare sind die einzige
-- Funktion, die gleichzeitig Verweildauer UND Verstaendnis erhoeht.
--
-- Warum es KEIN allgemeiner Kommentarbereich ist
-- ----------------------------------------------
-- Die Zielgruppe faengt bei 14 an. Ein offener Kommentarbereich fuer
-- Minderjaehrige ist kein Feature, sondern eine Aufsichtspflicht - und
-- eine, die ein Zweipersonenprojekt nicht erfuellen kann.
--
-- Deshalb ist der Bereich absichtlich eng gebaut:
--
--   · Es gibt genau ZWEI Arten von Beitrag: eine FRAGE zur Karte und eine
--     ANTWORT auf eine Frage. Keine Meinungen, keine Verlaeufe, keine
--     Unterhaltungen ohne Bezug.
--   · Keine Direktnachrichten. Nirgends.
--   · Jeder Beitrag laeuft durch eine maschinelle Vorpruefung, bevor er
--     sichtbar wird (status 'pending' -> 'visible'). Die Pruefung macht
--     die App bzw. ein Hintergrundlauf; hier steht nur der Zustand.
--   · Melden ist eingebaut, nicht nachgeruestet. Ab drei Meldungen
--     verschwindet ein Beitrag automatisch aus der Ansicht.
--
-- Was das kostet: weniger Leben im Kommentarbereich. Was es bringt: einen,
-- den man verantworten kann.
-- =============================================================================

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references public.content_items(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- Antworten haengen an einer Frage. Genau eine Ebene tief: ohne Grenze
  -- entstehen Verlaeufe, und Verlaeufe sind nicht mehr moderierbar.
  parent_id   uuid references public.comments(id) on delete cascade,

  body        text not null check (length(btrim(body)) between 2 and 500),

  --   pending  vorgeprueft wird noch
  --   visible  sichtbar
  --   blocked  von der Vorpruefung abgelehnt
  --   hidden   nach Meldungen entfernt
  status      text not null default 'pending'
              check (status in ('pending', 'visible', 'blocked', 'hidden')),
  block_reason text,

  report_count int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists comments_card_idx
  on public.comments (content_id, created_at desc)
  where status = 'visible' and parent_id is null;

create index if not exists comments_thread_idx
  on public.comments (parent_id, created_at asc)
  where status = 'visible';

-- Eine Frage pro Person und Karte. Wer eine zweite stellen will, soll
-- erst die erste beantwortet bekommen - das haelt die Liste kurz und
-- verhindert, dass eine Person eine Karte zumuellt.
create unique index if not exists comments_one_question_idx
  on public.comments (content_id, user_id)
  where parent_id is null;


create table if not exists public.comment_reports (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);


alter table public.comments        enable row level security;
alter table public.comment_reports enable row level security;

-- Kein direkter Zugriff. Alles laeuft ueber die Funktionen unten: nur so
-- laesst sich erzwingen, dass ein Beitrag die Vorpruefung durchlaufen hat,
-- bevor ihn jemand sieht.
revoke all on public.comments        from anon, authenticated;
revoke all on public.comment_reports from anon, authenticated;
grant all on public.comments        to service_role;
grant all on public.comment_reports to service_role;


-- =============================================================================
-- Lesen
--
-- Fragen mit ihren Antworten, in einem Aufruf. Zwei Abfragen waeren
-- sauberer getrennt, aber bei einer Liste, die sich beim Oeffnen aufbaut,
-- zaehlt der eine Weg zum Server mehr.
-- =============================================================================
create or replace function public.get_comments(p_content_id uuid, p_limit int default 30)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(q order by q->>'at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',           c.id,
      'body',         c.body,
      'at',           c.created_at,
      'handle',       p.handle,
      'display_name', coalesce(nullif(trim(p.display_name), ''), p.handle),
      'avatar_seed',  p.avatar_seed,
      'avatar_path',  p.avatar_path,
      'is_mine',      c.user_id = auth.uid(),
      'answers', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id',           a.id,
                 'body',         a.body,
                 'at',           a.created_at,
                 'handle',       ap.handle,
                 'display_name', coalesce(nullif(trim(ap.display_name), ''), ap.handle),
                 'avatar_seed',  ap.avatar_seed,
                 'avatar_path',  ap.avatar_path,
                 'is_mine',      a.user_id = auth.uid()
               ) order by a.created_at asc), '[]'::jsonb)
          from public.comments a
          join public.profiles ap on ap.id = a.user_id
         where a.parent_id = c.id and a.status = 'visible'
      )
    ) as q
      from public.comments c
      join public.profiles p on p.id = c.user_id
     where c.content_id = p_content_id
       and c.parent_id is null
       and c.status = 'visible'
       and auth.uid() is not null
     order by c.created_at desc
     limit p_limit
  ) t;
$fn$;

grant execute on function public.get_comments(uuid, int) to authenticated;


-- =============================================================================
-- Schreiben
--
-- Landet auf 'pending'. Sichtbar wird der Beitrag erst, wenn die
-- Vorpruefung ihn freigibt - das macht approve_comment(), gerufen vom
-- Client direkt nach der Pruefung durch das Modell.
--
-- Warum der Client das darf: die Pruefung kostet einen Modellaufruf, und
-- den kann nur jemand ausloesen, der auch schreibt. Der Missbrauchsfall
-- waere, approve_comment ohne Pruefung zu rufen - deshalb darf es
-- ausschliesslich EIGENE Beitraege freigeben, und nur solche, die noch
-- auf 'pending' stehen. Wer das umgeht, gibt seinen eigenen Beitrag frei
-- und bleibt meldbar. Das ist derselbe Schutz wie bei einem offenen
-- Kommentarbereich - nur mit einer zusaetzlichen Huerde davor.
--
-- Die Karte muss gelesen sein. Dieselbe Regel wie beim Repost: wer nicht
-- gelesen hat, hat nichts zu fragen.
-- =============================================================================
create or replace function public.post_comment(
  p_content_id uuid,
  p_body       text,
  p_parent_id  uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_body text := btrim(p_body);
  v_id   uuid;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if length(v_body) < 2 or length(v_body) > 500 then
    raise exception 'Beitrag muss zwischen 2 und 500 Zeichen lang sein';
  end if;

  if not exists (
    select 1 from public.user_content_state
     where user_id = v_me and content_id = p_content_id and is_read_validated
  ) then
    raise exception 'card not read yet';
  end if;

  if p_parent_id is not null and not exists (
    select 1 from public.comments
     where id = p_parent_id and content_id = p_content_id and parent_id is null
  ) then
    raise exception 'Antwort ohne Frage';
  end if;

  insert into public.comments (content_id, user_id, parent_id, body)
  values (p_content_id, v_me, p_parent_id, v_body)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'pending');
exception
  when unique_violation then
    raise exception 'Du hast zu dieser Karte schon eine Frage gestellt';
end
$fn$;

grant execute on function public.post_comment(uuid, text, uuid) to authenticated;


create or replace function public.approve_comment(p_id uuid, p_ok boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;

  -- Nur eigene, nur solche, die noch warten. Ein freigegebener Beitrag
  -- laesst sich damit nicht nachtraeglich veraendern.
  update public.comments
     set status = case when p_ok then 'visible' else 'blocked' end,
         block_reason = case when p_ok then null else p_reason end
   where id = p_id
     and user_id = auth.uid()
     and status = 'pending';
end
$fn$;

grant execute on function public.approve_comment(uuid, boolean, text) to authenticated;


-- =============================================================================
-- Melden und Loeschen
-- =============================================================================
create or replace function public.report_comment(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;

  insert into public.comment_reports (comment_id, user_id)
  values (p_id, auth.uid())
  on conflict do nothing;

  select count(*) into v_count from public.comment_reports where comment_id = p_id;
  update public.comments set report_count = v_count where id = p_id;

  -- Drei Meldungen, und der Beitrag ist weg. Lieber einmal zu viel
  -- verschwunden als einmal zu lange stehen geblieben: das Wiederholen
  -- kostet eine Minute, der umgekehrte Fall kostet Vertrauen.
  if v_count >= 3 then
    update public.comments set status = 'hidden' where id = p_id;
  end if;
end
$fn$;

grant execute on function public.report_comment(uuid) to authenticated;


create or replace function public.delete_comment(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.comments where id = p_id and user_id = auth.uid();
$fn$;

grant execute on function public.delete_comment(uuid) to authenticated;


-- --- Zaehler fuer die Karte -------------------------------------------------
alter table public.content_items
  add column if not exists comment_count int not null default 0;

create or replace function public.tg_comment_count()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_card uuid;
begin
  v_card := coalesce(new.content_id, old.content_id);
  update public.content_items
     set comment_count = (
       select count(*) from public.comments
        where content_id = v_card and status = 'visible'
     )
   where id = v_card;
  return null;
end
$fn$;

drop trigger if exists comment_count_trg on public.comments;
create trigger comment_count_trg
  after insert or update or delete on public.comments
  for each row execute function public.tg_comment_count();
