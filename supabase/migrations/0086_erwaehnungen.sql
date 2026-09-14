-- =============================================================================
-- 0086_erwaehnungen.sql  ·  @name erwaehnen
--
-- Gewuenscht: "Leute mit @ erwaehnen - fuer andere anklickbar".
--
-- Anklickbar macht es die App (ErwaehnungsText): im Text steht einfach
-- "@handle", gespeichert wird nichts Zusaetzliches. Das haelt den Text so,
-- wie er geschrieben wurde, und eine spaetere Umbenennung zerschiesst keine
-- Verweise in einer Nebentabelle - der Link fuehrt dann eben ins Leere, wie
-- ein alter Link ueberall.
--
-- Was die Datenbank dazu tut: Wer erwaehnt wird, erfaehrt es. Sonst ist eine
-- Erwaehnung ein Ruf in einen leeren Raum.
--
-- Regeln fuer die Meldung
-- -----------------------
--   * hoechstens zehn Erwaehnungen je Text - sonst wird @ zum Massenversand
--   * niemand wird ueber sich selbst benachrichtigt
--   * notify_social gilt, wie bei allen sozialen Meldungen (0078)
--   * nur wer den Beitrag auch SEHEN darf - eine Meldung, die auf "Diesen
--     Beitrag sehen nur Follower" fuehrt, ist schlimmer als keine
--   * der Autor eines Beitrags bekommt fuer einen Kommentar darunter schon
--     "hat deinen Beitrag kommentiert" und keine zweite Meldung
--
-- Die Muster-Regel passt zu profiles.handle (0001: a-z, 0-9, _, 3 bis 20
-- Zeichen). Davor darf kein Buchstabe stehen: "mail@beispiel" ist keine
-- Erwaehnung.
-- =============================================================================

create or replace function public.erwaehnte_profile(p_text text)
returns setof uuid
language sql stable security definer set search_path = ''
as $fn$
  select p.id
    from public.profiles p
   where p.handle in (
     select distinct lower(m[2])
       from regexp_matches(coalesce(p_text, ''),
                           '(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])', 'g') as m
      limit 10
   );
$fn$;
revoke execute on function public.erwaehnte_profile(text) from anon, authenticated;


alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel',
                  'comment_like', 'mention'));


-- Ein Trigger fuer drei Tabellen. Die Felder, die es nur in einer gibt
-- (post_id, content_id), stehen in getrennten Zweigen - plpgsql wertet einen
-- Ausdruck erst aus, wenn der Zweig laeuft.
create or replace function public.on_erwaehnung_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name  text := public.anzeigename(new.user_id);
  v_url   text;
  v_wo    text;
  v_post  uuid;
  v_autor uuid;
  v_ziel  uuid;
begin
  if tg_table_name = 'posts' then
    v_post := new.id;
    v_url  := '/post/' || new.id::text;
    v_wo   := 'Beitrag';
  elsif tg_table_name = 'post_comments' then
    v_post := new.post_id;
    v_url  := '/post/' || new.post_id::text || '?kommentar=' || new.id::text;
    v_wo   := 'Kommentar';
    select user_id into v_autor from public.posts where id = new.post_id;
  else
    v_url  := '/reel/' || new.content_id::text;
    v_wo   := 'Kommentar';
  end if;

  for v_ziel in select * from public.erwaehnte_profile(new.body) loop
    continue when v_ziel = new.user_id;
    continue when v_ziel = v_autor;
    continue when not public.will_sozial(v_ziel);
    continue when v_post is not null and not public.post_sichtbar(v_post, v_ziel);

    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    values (v_ziel, 'mention',
            v_name || ' hat dich in einem ' || v_wo || ' erwähnt',
            left(new.body, 140), v_url,
            'mention:' || tg_table_name || ':' || new.id::text || ':' || v_ziel::text)
    on conflict do nothing;
  end loop;

  return new;
end
$fn$;

drop trigger if exists posts_erwaehnung on public.posts;
create trigger posts_erwaehnung
  after insert on public.posts
  for each row when (new.status = 'visible' and new.body like '%@%')
  execute function public.on_erwaehnung_notify();

drop trigger if exists post_comments_erwaehnung on public.post_comments;
create trigger post_comments_erwaehnung
  after insert on public.post_comments
  for each row when (new.status = 'visible' and new.body like '%@%')
  execute function public.on_erwaehnung_notify();

drop trigger if exists comments_erwaehnung on public.comments;
create trigger comments_erwaehnung
  after insert on public.comments
  for each row when (new.status = 'visible' and new.body like '%@%')
  execute function public.on_erwaehnung_notify();


-- --- Selbsttest (schreibt nichts, wie 0085) --------------------------------------------
--
-- 1. Erkennt die Regel Erwaehnungen - und "mail@beispiel" nicht?
-- 2. Gemeldet: "Beitraege auch im Profil sehen, wenn man nicht folgt". Das
--    sollte seit 0084 so sein. Hier geprueft als jemand, der dem Autor
--    wirklich NICHT folgt.
do $test$
declare
  v_handle text;
  v_autor  uuid;
  v_post   uuid;
  v_fremd  uuid;
  v_j      jsonb;
  v_n      int;
begin
  select handle into v_handle from public.profiles order by created_at limit 1;
  select count(*) into v_n from public.erwaehnte_profile('Hallo @' || upper(v_handle) || ', schau mal');
  if v_n <> 1 then raise exception 'Selbsttest: @% nicht erkannt', v_handle; end if;
  select count(*) into v_n from public.erwaehnte_profile('mail' || '@' || v_handle || '.at');
  if v_n <> 0 then raise exception 'Selbsttest: E-Mail als Erwaehnung erkannt'; end if;

  select po.id, po.user_id into v_post, v_autor
    from public.posts po join public.profiles a on a.id = po.user_id
   where po.status = 'visible' and a.beitraege_oeffentlich
   order by po.created_at desc limit 1;
  if v_post is null then
    raise notice 'Selbsttest: kein oeffentlicher Beitrag - Teil 2 uebersprungen';
    return;
  end if;

  select p.id into v_fremd
    from public.profiles p
   where p.id <> v_autor
     and not exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = v_autor)
   limit 1;
  if v_fremd is null then
    raise notice 'Selbsttest: alle folgen dem Autor - Teil 2 uebersprungen';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_fremd, 'role', 'authenticated')::text, true);

  select handle into v_handle from public.profiles where id = v_autor;
  v_j := public.get_user_posts(v_handle, 10, null);
  if (v_j->>'gesperrt')::boolean or jsonb_array_length(v_j->'posts') = 0 then
    raise exception 'Selbsttest: Nicht-Follower sieht die Beitraege von @% nicht: %', v_handle, v_j;
  end if;
  v_j := public.get_post(v_post);
  if (v_j->>'gesperrt')::boolean then
    raise exception 'Selbsttest: Nicht-Follower sieht den Beitrag nicht';
  end if;
  raise notice 'Selbsttest: Nicht-Follower sieht die Beitraege von @%', v_handle;

  perform set_config('request.jwt.claims', '', true);
end
$test$;

notify pgrst, 'reload schema';
