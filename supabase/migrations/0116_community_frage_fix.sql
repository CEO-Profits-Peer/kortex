-- =============================================================================
-- 0116_community_frage_fix.sql  ·  Keine doppelte Antwort-Meldung
--
-- 0115 hat einen Trigger fuer Antworten unter Karten angelegt - den gab es
-- aber schon (0078, comments_reply_notify). Folge: zwei Meldungen je
-- Antwort. Der aus 0115 faellt weg; der aus 0078 bekommt den Frage-Text
-- ("hat deine Frage beantwortet"). Und beste_antwort achtet wie alle
-- sozialen Meldungen auf will_sozial.
-- =============================================================================

drop trigger if exists comments_antwort_meldung on public.comments;
drop function if exists public.tg_karten_antwort();

-- Vollstaendige Fassung aus 0078, nur der Titel unterscheidet Fragen.
create or replace function public.on_comment_reply_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_eltern uuid;
  v_frage  boolean;
begin
  select user_id, ist_frage into v_eltern, v_frage from public.comments where id = new.parent_id;
  if v_eltern is null or v_eltern = new.user_id or not public.will_sozial(v_eltern) then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  values (v_eltern, 'comment_reply',
          public.anzeigename(new.user_id) ||
            case when v_frage then ' hat deine Frage beantwortet' else ' hat dir geantwortet' end,
          left(new.body, 140), '/reel/' || new.content_id::text,
          'reply:' || new.id::text)
  on conflict do nothing;
  return new;
end
$fn$;

-- Vollstaendige Fassung aus 0115, Meldung nur mit will_sozial.
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
  if v_a.user_id <> v_me and public.will_sozial(v_a.user_id) then
    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    values (v_a.user_id, 'beste_antwort', 'Beste Antwort',
            public.anzeigename(v_me) || ' fand deine Antwort am hilfreichsten.',
            '/reel/' || v_a.content_id::text, 'beste:' || p_antwort::text)
    on conflict do nothing;
  end if;
  return true;
end
$fn$;

do $test$
declare
  v_a uuid;
  v_b uuid;
  v_k uuid;
  v_f jsonb;
  v_x jsonb;
  v_n int;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  select id into v_k from public.content_items where status = 'approved' limit 1;
  if v_b is null or v_k is null then raise notice 'Selbsttest 0116: zu wenig Daten'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_f := public.frage_stellen(v_k, 'Selbsttest: Warum ist das so?');
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_x := public.post_comment(v_k, 'Selbsttest: Weil es so ist.', (v_f->>'id')::uuid);
    select count(*) into v_n from public.notifications
     where user_id = v_a and dedupe_key in ('reply:' || (v_x->>'id'), 'karten_antwort:' || (v_x->>'id'));
    if v_n > 1 then raise exception 'Selbsttest 0116: % Meldungen fuer eine Antwort', v_n; end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0116: ok';
end
$test$;

notify pgrst, 'reload schema';
