-- =============================================================================
-- 0099_reichweite.sql  ·  PRO: Reichweite je Beitrag und Lern-Heatmap
--
-- Reichweite = wie viele VERSCHIEDENE Leute einen Beitrag im Home auf dem
-- Bildschirm hatten. Gezaehlt wird ab dieser Migration - rueckwirkend gibt
-- es nichts zu zaehlen (so am 18.09. angekuendigt).
--
-- post_aufrufe haelt (Beitrag, Person, Tag) - eine Zeile pro Person und Tag,
-- egal wie oft sie vorbeiscrollt. Eigene Beitraege zaehlen nicht, und nur,
-- was die Person laut post_sichtbar auch sehen darf: sonst liesse sich die
-- Zahl mit erfundenen IDs aufblasen.
--
-- Die Tabelle ist fuer den Client nicht lesbar; die Zahlen kommen nur
-- zusammengefasst ueber get_my_statistik, und nur mit PRO.
--
-- get_my_statistik vollstaendig aus 0083 (seitdem nicht neu geschrieben).
-- =============================================================================

create table if not exists public.post_aufrufe (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tag     date not null default current_date,
  primary key (post_id, user_id, tag)
);
create index if not exists post_aufrufe_tag_idx on public.post_aufrufe (tag);
alter table public.post_aufrufe enable row level security;
revoke all on public.post_aufrufe from anon, authenticated;

create or replace function public.beitraege_gesehen(p_ids uuid[])
returns void
language sql security definer set search_path = ''
as $fn$
  insert into public.post_aufrufe (post_id, user_id)
  select p.id, auth.uid()
    from public.posts p
   where p.id = any (p_ids[1:50])
     and p.user_id <> auth.uid()
     and public.post_sichtbar(p.id, auth.uid())
  on conflict do nothing;
$fn$;
revoke execute on function public.beitraege_gesehen(uuid[]) from anon;
grant execute on function public.beitraege_gesehen(uuid[]) to authenticated;

create or replace function public.get_my_statistik()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_p  public.profiles;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_me;

  return jsonb_build_object(
    'dabei_seit',      v_p.created_at,
    -- Seit wann follow_events mitschreibt (0080). Davor: siehe Kopf.
    'mitschrift_seit', '2026-09-13'::date,

    'sozial', jsonb_build_object(
      'follower',   v_p.follower_count,
      'folgt',      v_p.following_count,
      'beitraege',  (select count(*) from public.posts where user_id = v_me and status = 'visible'),
      'likes',      (select count(*) from public.post_likes l
                       join public.posts po on po.id = l.post_id
                      where po.user_id = v_me and po.status = 'visible' and l.user_id <> v_me),
      'kommentar_likes', (select count(*) from public.post_comment_likes l
                            join public.post_comments c on c.id = l.comment_id
                           where c.user_id = v_me and c.status = 'visible' and l.user_id <> v_me),
      'kommentare', (select count(*) from public.post_comments c
                       join public.posts po on po.id = c.post_id
                      where po.user_id = v_me and c.user_id <> v_me and c.status = 'visible'),
      'geteilt',    (select count(*) from public.posts r
                       join public.posts o on o.id = r.repost_of
                      where o.user_id = v_me and r.user_id <> v_me and r.status = 'visible'),
      'empfohlen',  (select count(*) from public.reposts where user_id = v_me)
    ),

    'lernen', jsonb_build_object(
      'gesehen',       (select count(*) from public.user_content_state where user_id = v_me),
      'gelesen',       (select count(*) from public.user_content_state where user_id = v_me and is_read_validated),
      'gelikt',        (select count(*) from public.user_content_state where user_id = v_me and is_liked),
      'quiz_versuche', (select coalesce(sum(quiz_attempts), 0) from public.user_content_state where user_id = v_me),
      'quiz_richtig',  (select coalesce(sum(quiz_correct), 0) from public.user_content_state where user_id = v_me),
      'xp',            v_p.xp_total,
      'streak',        v_p.streak_current,
      'streak_best',   v_p.streak_best,
      'fokus_minuten', round(coalesce(v_p.focus_seconds_total, 0) / 60.0)
    ),

    -- 90 Tage, je Tag: Follower am Tagesende, dazugekommen, gegangen.
    'follower_verlauf', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tag', d.tag::date,
               'follower', (select count(*) filter (where e.art = 'folgt')
                                 - count(*) filter (where e.art = 'entfolgt')
                              from public.follow_events e
                             where e.followee_id = v_me and e.created_at < d.tag + interval '1 day'),
               'neu',  (select count(*) from public.follow_events e
                         where e.followee_id = v_me and e.art = 'folgt'
                           and e.created_at >= d.tag and e.created_at < d.tag + interval '1 day'),
               'weg',  (select count(*) from public.follow_events e
                         where e.followee_id = v_me and e.art = 'entfolgt'
                           and e.created_at >= d.tag and e.created_at < d.tag + interval '1 day')
             ) order by d.tag), '[]'::jsonb)
        from generate_series(date_trunc('day', now()) - interval '89 days',
                             date_trunc('day', now()), interval '1 day') as d(tag)
    ),

    -- 30 Tage gelesene Karten.
    'gelesen_verlauf', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tag', d.tag::date,
               'anzahl', (select count(*) from public.xp_ledger l
                           where l.user_id = v_me and l.kind = 'read'
                             and l.created_at >= d.tag and l.created_at < d.tag + interval '1 day')
             ) order by d.tag), '[]'::jsonb)
        from generate_series(date_trunc('day', now()) - interval '29 days',
                             date_trunc('day', now()), interval '1 day') as d(tag)
    ),

    -- 0099 (PRO): Reichweite und Lern-Heatmap. Ohne PRO nur 'pro: false',
    -- damit die App an derselben Stelle zeigen kann, was es gaebe.
    'reichweite', case when not public.ist_pro(v_me) then jsonb_build_object('pro', false) else jsonb_build_object(
      'pro', true,
      'seit', (select min(tag) from public.post_aufrufe),
      'leute_30', (select count(distinct a.user_id) from public.post_aufrufe a
                     join public.posts po on po.id = a.post_id
                    where po.user_id = v_me and a.tag > current_date - 30),
      'beitraege', (
        select coalesce(jsonb_agg(to_jsonb(t) order by t.leute desc, t.at desc), '[]'::jsonb)
          from (
            select po.id, left(po.body, 100) as body, po.art, po.created_at as at,
                   count(distinct a.user_id) as leute,
                   (select count(*) from public.post_likes l where l.post_id = po.id) as likes
              from public.posts po
              join public.post_aufrufe a on a.post_id = po.id
             where po.user_id = v_me and po.status = 'visible'
             group by po.id
             order by count(distinct a.user_id) desc, po.created_at desc
             limit 10
          ) t
      ),
      -- 12 Wochen, je Tag gelesene Karten - wie gelesen_verlauf, nur laenger.
      'heatmap', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'tag', d.tag::date,
                 'anzahl', (select count(*) from public.xp_ledger l
                             where l.user_id = v_me and l.kind = 'read'
                               and l.created_at >= d.tag and l.created_at < d.tag + interval '1 day')
               ) order by d.tag), '[]'::jsonb)
          from generate_series(date_trunc('day', now()) - interval '83 days',
                               date_trunc('day', now()), interval '1 day') as d(tag)
      )
    ) end,

    -- Woher neue Follower kamen - nur Mitgeschriebenes, keine Nachtraege.
    'quellen', (
      select coalesce(jsonb_object_agg(q.quelle, q.anzahl), '{}'::jsonb)
        from (select coalesce(e.quelle, 'unbekannt') as quelle, count(*) as anzahl
                from public.follow_events e
               where e.followee_id = v_me and e.art = 'folgt' and not e.nachgetragen
               group by 1) q
    ),

    -- Die fuenf Beitraege mit den meisten Likes, samt Followern, die sie brachten.
    'top_beitraege', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.likes desc, t.at desc), '[]'::jsonb)
        from (
          select po.id, left(po.body, 140) as body, po.created_at as at,
                 (select count(*) from public.post_likes l where l.post_id = po.id) as likes,
                 (select count(*) from public.post_comments c
                   where c.post_id = po.id and c.status = 'visible') as kommentare,
                 (select count(*) from public.posts r
                   where r.repost_of = po.id and r.status = 'visible') as geteilt,
                 (select count(*) from public.follow_events e
                   where e.post_id = po.id and e.art = 'folgt') as neue_follower,
                 -- 0099 (PRO): wie viele Leute ihn im Home gesehen haben.
                 case when public.ist_pro(v_me) then
                   (select count(distinct a.user_id) from public.post_aufrufe a where a.post_id = po.id)
                 end as leute
            from public.posts po
           where po.user_id = v_me and po.status = 'visible'
           order by (select count(*) from public.post_likes l where l.post_id = po.id) desc,
                    po.created_at desc
           limit 5
        ) t
    )
  );
end
$fn$;

grant execute on function public.get_my_statistik() to authenticated;

-- --- Selbsttest (rollt alles zurueck) ------------------------------------------------
do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0099: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    update public.profiles set plan = 'free', plan_expires_at = null where id = v_id;
    v_j := public.get_my_statistik();
    if (v_j->'reichweite'->>'pro')::boolean then raise exception 'Selbsttest 0099: Reichweite ohne PRO'; end if;
    update public.profiles set plan = 'gifted', plan_expires_at = now() + interval '1 day' where id = v_id;
    v_j := public.get_my_statistik();
    if jsonb_array_length(v_j->'reichweite'->'heatmap') <> 84 then
      raise exception 'Selbsttest 0099: Heatmap nicht 84 Tage: %', jsonb_array_length(v_j->'reichweite'->'heatmap');
    end if;
    perform public.beitraege_gesehen(array[gen_random_uuid()]);
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0099: ok';
end
$test$;

notify pgrst, 'reload schema';
