-- =============================================================================
-- 0115_community_frage.sql  ·  Frage an die Community, beste Antwort
--
-- Kommentare an Karten gibt es seit 0036/0040, mit einer Ebene Antworten.
-- Neu:
--   * Ein Kommentar kann eine FRAGE sein (frage_stellen). Fragen sind in der
--     App markiert und landen bei anderen unter "Kannst du helfen?" - aber
--     nur bei Leuten, die die Karte selbst gelesen haben (offene_fragen).
--   * Wer gefragt hat, markiert EINE Antwort als beste (beste_antwort).
--     Sie steht dann oben und hervorgehoben; die Person bekommt eine
--     Meldung. Keine XP dafuer - sonst lohnt es sich, Antworten zu
--     verabreden.
--   * Antworten auf eigene Kommentare an Karten melden sich jetzt auch
--     (bisher nur bei Beitraegen, 0078).
--
-- Vorpruefung, Melden und Ausblenden bleiben wie in 0040: frage_stellen geht
-- ueber post_comment.
-- =============================================================================

alter table public.comments add column if not exists ist_frage boolean not null default false;
alter table public.comments add column if not exists beste boolean not null default false;
create unique index if not exists comments_eine_beste_idx
  on public.comments (parent_id) where beste;
create index if not exists comments_offene_fragen_idx
  on public.comments (created_at desc) where ist_frage and status = 'visible';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel',
                  'comment_like', 'mention', 'rueckblick', 'wunsch', 'lernpartner',
                  'beste_antwort'));

create or replace function public.frage_stellen(p_content_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_r jsonb;
begin
  v_r := public.post_comment(p_content_id, p_body, null);
  update public.comments set ist_frage = true where id = (v_r->>'id')::uuid and user_id = auth.uid();
  return v_r;
end
$fn$;

-- Umschalten: dieselbe Antwort nochmal = Markierung weg.
create or replace function public.beste_antwort(p_antwort uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_a     public.comments;
  v_frage public.comments;
begin
  select * into v_a from public.comments where id = p_antwort and status = 'visible';
  if v_a.id is null or v_a.parent_id is null then raise exception 'Antwort nicht gefunden'; end if;
  select * into v_frage from public.comments where id = v_a.parent_id;
  if v_frage.user_id <> v_me then raise exception 'Nur wer gefragt hat, wählt die beste Antwort'; end if;

  if v_a.beste then
    update public.comments set beste = false where id = p_antwort;
    return false;
  end if;
  update public.comments set beste = false where parent_id = v_a.parent_id and beste;
  update public.comments set beste = true where id = p_antwort;
  if v_a.user_id <> v_me then
    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    select v_a.user_id, 'beste_antwort', 'Beste Antwort',
           coalesce(nullif(btrim(p.display_name), ''), p.handle) || ' fand deine Antwort am hilfreichsten.',
           '/reel/' || v_a.content_id::text, 'beste:' || p_antwort::text
      from public.profiles p where p.id = v_me
    on conflict do nothing;
  end if;
  return true;
end
$fn$;

-- Antwort auf einen Kommentar an einer Karte -> Meldung an den, der ihn schrieb.
create or replace function public.tg_karten_antwort()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_eltern uuid;
  v_frage  boolean;
  v_name   text;
begin
  if new.parent_id is null or new.status <> 'visible' then return new; end if;
  select user_id, ist_frage into v_eltern, v_frage from public.comments where id = new.parent_id;
  if v_eltern is null or v_eltern = new.user_id then return new; end if;
  select coalesce(nullif(btrim(display_name), ''), handle) into v_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (v_eltern, 'comment_reply',
          case when v_frage then v_name || ' hat deine Frage beantwortet'
               else v_name || ' hat dir geantwortet' end,
          left(new.body, 140), '/reel/' || new.content_id::text, 'karten_antwort:' || new.id::text)
  on conflict do nothing;
  return new;
end
$fn$;
drop trigger if exists comments_antwort_meldung on public.comments;
create trigger comments_antwort_meldung
  after insert on public.comments
  for each row execute function public.tg_karten_antwort();
revoke execute on function public.tg_karten_antwort() from anon, authenticated;

-- get_comments: vollstaendige Fassung aus 0036, dazu 'frage' und 'beste';
-- die beste Antwort steht vorne.
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
      'frage',        c.ist_frage,
      'answers', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id',           a.id,
                 'body',         a.body,
                 'at',           a.created_at,
                 'handle',       ap.handle,
                 'display_name', coalesce(nullif(trim(ap.display_name), ''), ap.handle),
                 'avatar_seed',  ap.avatar_seed,
                 'avatar_path',  ap.avatar_path,
                 'is_mine',      a.user_id = auth.uid(),
                 'beste',        a.beste
               ) order by a.beste desc, a.created_at asc), '[]'::jsonb)
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

-- Offene Fragen zu Karten, die ich gelesen habe: noch ohne beste Antwort,
-- aus den letzten 30 Tagen, nicht meine eigenen. Wenig beantwortete zuerst.
create or replace function public.offene_fragen(p_limit int default 10)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', c.id, 'content_id', c.content_id, 'title', ci.title,
               'body', c.body, 'at', c.created_at,
               'antworten', (select count(*) from public.comments a
                              where a.parent_id = c.id and a.status = 'visible')) as x
        from public.comments c
        join public.content_items ci on ci.id = c.content_id and ci.status = 'approved'
        join public.user_content_state s
          on s.content_id = c.content_id and s.user_id = auth.uid() and s.is_read_validated
       where c.ist_frage and c.status = 'visible' and c.parent_id is null
         and c.user_id <> auth.uid()
         and c.created_at > now() - interval '30 days'
         and not exists (select 1 from public.comments b where b.parent_id = c.id and b.beste)
         and not exists (select 1 from public.comments m where m.parent_id = c.id and m.user_id = auth.uid())
       order by (select count(*) from public.comments a where a.parent_id = c.id and a.status = 'visible'),
                c.created_at desc
       limit least(greatest(coalesce(p_limit, 10), 1), 30)
    ) t;
$fn$;

revoke execute on function public.frage_stellen(uuid, text), public.beste_antwort(uuid),
  public.offene_fragen(int) from anon;
grant execute on function public.frage_stellen(uuid, text), public.beste_antwort(uuid),
  public.offene_fragen(int) to authenticated;

do $test$
declare
  v_a uuid;
  v_b uuid;
  v_k uuid;
  v_f jsonb;
  v_x jsonb;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  select id into v_k from public.content_items where status = 'approved' limit 1;
  if v_b is null or v_k is null then raise notice 'Selbsttest 0115: zu wenig Daten'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_f := public.frage_stellen(v_k, 'Selbsttest: Warum ist das so?');
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_x := public.post_comment(v_k, 'Selbsttest: Weil es so ist.', (v_f->>'id')::uuid);
    if not exists (select 1 from public.notifications where user_id = v_a
                    and dedupe_key = 'karten_antwort:' || (v_x->>'id')) then
      raise exception 'Selbsttest 0115: keine Antwort-Meldung';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    if not public.beste_antwort((v_x->>'id')::uuid) then raise exception 'Selbsttest 0115: beste'; end if;
    v_f := public.get_comments(v_k, 50);
    if not exists (select 1 from jsonb_array_elements(v_f) q, jsonb_array_elements(q->'answers') a
                    where (q->>'frage')::boolean and (a->>'beste')::boolean) then
      raise exception 'Selbsttest 0115: beste fehlt in get_comments';
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0115: ok';
end
$test$;

notify pgrst, 'reload schema';
