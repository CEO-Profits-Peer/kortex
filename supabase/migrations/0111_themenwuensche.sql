-- =============================================================================
-- 0111_themenwuensche.sql  ·  Themen wuenschen, freigeben, als Serie bauen
--
-- Wer ein Thema vermisst, wuenscht es sich. Gleiche Wuensche (gleicher Text
-- nach Kleinschreibung und Leerzeichen) werden zusammengezaehlt - so sieht
-- das Kontrollzentrum, was oft gewollt wird.
--
-- NICHTS wird ohne Freigabe gebaut. Der Betreiber entscheidet im
-- Kontrollzentrum (Reiter "Wuensche"): Ja mit Kategorie und Suchbegriff,
-- oder Nein. Grund: Wuensche sind freier Text von Nutzern - die Wortliste
-- (post_rejection) faengt Grobes ab, aber ob ein Thema in eine Lern-App
-- gehoert, entscheidet ein Mensch. Nutzer sehen fremde Wuensche NIE im
-- Wortlaut, nur freigegebene Themen ("Kommt bald").
--
-- Nach der Freigabe sucht die Pipeline (evergreen.py) mit dem Suchbegriff
-- bis zu vier Wikipedia-Artikel und legt sie als Themen mit Herkunft
-- 'wunsch' in topic_memory an - vor allen anderen Themen. Sobald der erste
-- Artikel eine Karte ist, bekommen alle, die sich das Thema gewuenscht
-- haben, eine Meldung (Trigger unten).
--
-- Grenzen: 3 Wuensche am Tag, 20 offene je Person.
-- =============================================================================

create table if not exists public.themen_wuensche (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  text       text not null check (length(btrim(text)) between 2 and 80),
  norm       text not null,
  language   text not null check (language in ('de', 'en')),
  created_at timestamptz not null default now(),
  unique (user_id, norm, language)
);
create index if not exists themen_wuensche_norm_idx on public.themen_wuensche (norm, language);
alter table public.themen_wuensche enable row level security;
revoke all on public.themen_wuensche from anon, authenticated;

-- Die Entscheidung je Thema (norm + Sprache).
create table if not exists public.themen_freigabe (
  id            uuid primary key default gen_random_uuid(),
  norm          text not null,
  language      text not null check (language in ('de', 'en')),
  status        text not null check (status in ('frei', 'nein', 'in_arbeit', 'fertig')),
  anzeige       text not null,
  suchbegriff   text,
  category_id   text references public.categories(id) on delete set null,
  titel         text[],
  entschieden_at timestamptz not null default now(),
  fertig_at     timestamptz,
  unique (norm, language)
);
alter table public.themen_freigabe enable row level security;
revoke all on public.themen_freigabe from anon, authenticated;

-- topic_memory kennt jetzt eine dritte Herkunft.
alter table public.topic_memory drop constraint if exists topic_memory_herkunft_check;
alter table public.topic_memory add constraint topic_memory_herkunft_check
  check (herkunft in ('liste', 'entdeckt', 'wunsch'));
alter table public.topic_memory
  add column if not exists freigabe_id uuid references public.themen_freigabe(id) on delete set null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel',
                  'comment_like', 'mention', 'rueckblick', 'wunsch'));

create or replace function public.wunsch_norm(p_text text)
returns text
language sql immutable set search_path = ''
as $fn$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$fn$;


-- --- Nutzer -----------------------------------------------------------------

create or replace function public.thema_wuenschen(p_text text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me   uuid := auth.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_norm text := public.wunsch_norm(p_text);
  v_lang text;
  v_frei text;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if length(v_text) < 2 or length(v_text) > 80 then raise exception 'Zwei bis 80 Zeichen'; end if;
  if public.post_rejection(v_text) is not null then raise exception 'Dieses Thema geht nicht'; end if;
  if (select count(*) from public.themen_wuensche
       where user_id = v_me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Drei Wünsche am Tag – morgen wieder';
  end if;
  if (select count(*) from public.themen_wuensche w
       where w.user_id = v_me
         and not exists (select 1 from public.themen_freigabe f
                          where f.norm = w.norm and f.language = w.language
                            and f.status in ('nein', 'fertig'))) >= 20 then
    raise exception 'Schon 20 offene Wünsche';
  end if;

  select coalesce(nullif(language, ''), 'de') into v_lang from public.profiles where id = v_me;
  if v_lang not in ('de', 'en') then v_lang := 'de'; end if;

  insert into public.themen_wuensche (user_id, text, norm, language)
  values (v_me, v_text, v_norm, v_lang)
  on conflict (user_id, norm, language) do nothing;

  select status into v_frei from public.themen_freigabe where norm = v_norm and language = v_lang;
  return jsonb_build_object(
    'anzahl', (select count(*) from public.themen_wuensche where norm = v_norm and language = v_lang),
    'status', coalesce(v_frei, 'offen'));
end
$fn$;

create or replace function public.wunsch_zuruecknehmen(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.themen_wuensche where id = p_id and user_id = auth.uid();
$fn$;

-- Eigene Wuensche mit Stand; dazu freigegebene Themen aller ("Kommt bald"),
-- aber nur im Wortlaut der Freigabe - nie der Text anderer Nutzer.
create or replace function public.meine_wuensche()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'meine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'text', w.text, 'created_at', w.created_at,
               'anzahl', (select count(*) from public.themen_wuensche x
                           where x.norm = w.norm and x.language = w.language),
               'status', coalesce(f.status, 'offen'),
               'anzeige', f.anzeige)
             order by w.created_at desc)
        from public.themen_wuensche w
        left join public.themen_freigabe f on f.norm = w.norm and f.language = w.language
       where w.user_id = auth.uid()), '[]'::jsonb),
    'bald', coalesce((
      select jsonb_agg(jsonb_build_object('anzeige', f.anzeige, 'status', f.status,
                                          'category_id', f.category_id)
             order by f.entschieden_at desc)
        from (select * from public.themen_freigabe
               where status in ('frei', 'in_arbeit', 'fertig')
                 and language = any (public.user_feed_languages(auth.uid()))
               order by entschieden_at desc limit 12) f), '[]'::jsonb)
  );
$fn$;


-- --- Kontrollzentrum ---------------------------------------------------------

create or replace function public.admin_wuensche(p_pin text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  perform public.assert_admin(p_pin);
  select jsonb_build_object(
    'offen', coalesce((
      select jsonb_agg(x order by (x->>'anzahl')::int desc, x->>'zuletzt' desc)
        from (
          select jsonb_build_object(
                   'norm', w.norm, 'language', w.language,
                   -- Die haeufigste Schreibweise zeigen.
                   'text', (select w2.text from public.themen_wuensche w2
                             where w2.norm = w.norm and w2.language = w.language
                             group by w2.text order by count(*) desc, min(w2.created_at) limit 1),
                   'anzahl', count(*), 'zuletzt', max(w.created_at)) as x
            from public.themen_wuensche w
           where not exists (select 1 from public.themen_freigabe f
                              where f.norm = w.norm and f.language = w.language)
           group by w.norm, w.language
           limit 100
        ) t), '[]'::jsonb),
    'entschieden', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'anzeige', f.anzeige, 'language', f.language, 'status', f.status,
               'category_id', f.category_id, 'titel', f.titel, 'entschieden_at', f.entschieden_at,
               'anzahl', (select count(*) from public.themen_wuensche w
                           where w.norm = f.norm and w.language = f.language))
             order by f.entschieden_at desc)
        from (select * from public.themen_freigabe order by entschieden_at desc limit 30) f), '[]'::jsonb)
  ) into v_out;
  return v_out;
end
$fn$;

create or replace function public.admin_wunsch_entscheiden(
  p_pin text, p_norm text, p_language text, p_ja boolean,
  p_anzeige text default null, p_suchbegriff text default null, p_kategorie text default null)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_text text;
begin
  perform public.assert_admin(p_pin);
  select w.text into v_text from public.themen_wuensche w
   where w.norm = p_norm and w.language = p_language
   group by w.text order by count(*) desc limit 1;
  if v_text is null then raise exception 'Wunsch nicht gefunden'; end if;
  if p_ja then
    if not exists (select 1 from public.categories where id = p_kategorie and parent_id is not null) then
      raise exception 'Bitte eine Unterkategorie wählen';
    end if;
    if length(btrim(coalesce(p_suchbegriff, ''))) < 2 then raise exception 'Suchbegriff fehlt'; end if;
  end if;
  insert into public.themen_freigabe (norm, language, status, anzeige, suchbegriff, category_id)
  values (p_norm, p_language, case when p_ja then 'frei' else 'nein' end,
          coalesce(nullif(btrim(p_anzeige), ''), v_text),
          case when p_ja then btrim(p_suchbegriff) end,
          case when p_ja then p_kategorie end)
  on conflict (norm, language) do update
     set status = excluded.status, anzeige = excluded.anzeige, suchbegriff = excluded.suchbegriff,
         category_id = excluded.category_id, entschieden_at = now(), titel = null;
end
$fn$;


-- --- Fertig: Meldung an alle, die es wollten ------------------------------------

create or replace function public.wunsch_karte_fertig()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_f public.themen_freigabe;
begin
  if new.freigabe_id is null or new.status <> 'karte'
     or (tg_op = 'UPDATE' and old.status = 'karte') then
    return new;
  end if;
  update public.themen_freigabe set status = 'fertig', fertig_at = now()
   where id = new.freigabe_id and status <> 'fertig'
  returning * into v_f;
  if v_f.id is null then return new; end if;   -- schon gemeldet

  insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
  select w.user_id, 'wunsch',
         case when w.language = 'en' then 'Your topic is here' else 'Dein Wunschthema ist da' end,
         v_f.anzeige,
         '/search?q=' || replace(v_f.anzeige, ' ', '%20'),
         'wunsch:' || v_f.id::text
    from public.themen_wuensche w
   where w.norm = v_f.norm and w.language = v_f.language
  on conflict do nothing;
  return new;
end
$fn$;

drop trigger if exists topic_memory_wunsch_fertig on public.topic_memory;
create trigger topic_memory_wunsch_fertig
  after insert or update of status on public.topic_memory
  for each row execute function public.wunsch_karte_fertig();


revoke execute on function public.thema_wuenschen(text), public.wunsch_zuruecknehmen(uuid),
  public.meine_wuensche(), public.admin_wuensche(text),
  public.admin_wunsch_entscheiden(text, text, text, boolean, text, text, text) from anon;
grant execute on function public.thema_wuenschen(text), public.wunsch_zuruecknehmen(uuid),
  public.meine_wuensche(), public.admin_wuensche(text),
  public.admin_wunsch_entscheiden(text, text, text, boolean, text, text, text) to authenticated;
revoke execute on function public.wunsch_karte_fertig() from anon, authenticated;


do $test$
declare
  v_id  uuid;
  v_j   jsonb;
  v_f   uuid;
  v_kat text;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0111: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    v_j := public.thema_wuenschen('  Schwarze   Löcher ');
    if (v_j->>'anzahl')::int < 1 then raise exception 'Selbsttest 0111: Wunsch fehlt: %', v_j; end if;
    v_j := public.thema_wuenschen('schwarze löcher');  -- derselbe, zaehlt nicht doppelt
    if (v_j->>'anzahl')::int <> 1 then raise exception 'Selbsttest 0111: doppelt gezaehlt: %', v_j; end if;

    -- Freigabe und Fertig-Meldung ohne PIN direkt nachstellen.
    select id into v_kat from public.categories where parent_id is not null limit 1;
    insert into public.themen_freigabe (norm, language, status, anzeige, suchbegriff, category_id)
    select norm, language, 'in_arbeit', 'Schwarze Löcher', 'Schwarzes Loch', v_kat
      from public.themen_wuensche where user_id = v_id and norm = 'schwarze löcher'
    returning id into v_f;
    insert into public.topic_memory (language, title, category_id, herkunft, status, freigabe_id)
    select language, 'Selbsttest Schwarzes Loch', v_kat, 'wunsch', 'offen', v_f
      from public.themen_freigabe where id = v_f;
    update public.topic_memory set status = 'karte' where title = 'Selbsttest Schwarzes Loch';
    if not exists (select 1 from public.notifications
                    where user_id = v_id and dedupe_key = 'wunsch:' || v_f::text) then
      raise exception 'Selbsttest 0111: keine Meldung';
    end if;
    v_j := public.meine_wuensche();
    if v_j->'meine'->0->>'status' <> 'fertig' then raise exception 'Selbsttest 0111: Stand: %', v_j; end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0111: ok';
end
$test$;

notify pgrst, 'reload schema';
