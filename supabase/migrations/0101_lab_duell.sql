-- =============================================================================
-- 0101_lab_duell.sql  ·  LAB: Schaetz-Duelle unter geteilten Ergebnissen
--
-- Wer ein LAB-Ergebnis im Modus "Schaetzen" teilt (eingaben.tipp gesetzt),
-- stellt damit eine Frage: Die Zahl ist im Beitrag verdeckt, andere tippen
-- zuerst und sehen dann, wer am naechsten lag.
--
-- Der Server speichert nur die Tipps. Die richtige Zahl rechnet wie jedes
-- LAB-Ergebnis die App (rechnen.ts) aus den Eingaben - sie ist also fuer
-- Neugierige ablesbar. Das ist ein Spiel ohne XP und ohne Rangliste; dafuer
-- lohnt keine Server-Rechnung. Was der Server schuetzt: die Tipps der
-- ANDEREN sieht nur, wer selbst schon getippt hat (sonst tippt man einfach
-- den besten ab), und jeder tippt genau einmal.
-- =============================================================================

create table if not exists public.lab_tipps (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipp    numeric not null check (tipp >= 0 and tipp < 1e9),
  at      timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.lab_tipps enable row level security;
revoke all on public.lab_tipps from anon, authenticated;

-- Liste der Tipps - nur fuer Autor und fuer alle, die schon getippt haben.
create or replace function public.lab_tipps(p_post uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if not public.post_sichtbar(p_post, v_me) then raise exception 'Diesen Beitrag gibt es nicht mehr'; end if;
  if not exists (select 1 from public.posts where id = p_post and user_id = v_me)
     and not exists (select 1 from public.lab_tipps where post_id = p_post and user_id = v_me) then
    return jsonb_build_object('getippt', false, 'anzahl',
      (select count(*) from public.lab_tipps where post_id = p_post), 'tipps', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'getippt', true,
    'anzahl', (select count(*) from public.lab_tipps where post_id = p_post),
    'tipps', (
      -- limit IN der Unterabfrage: hinter jsonb_agg begrenzt es nichts (0065).
      select coalesce(jsonb_agg(jsonb_build_object(
               'handle', x.handle, 'name', x.name, 'ich', x.ich, 'tipp', x.tipp
             ) order by x.at), '[]'::jsonb)
        from (
          select p.handle, coalesce(nullif(trim(p.display_name), ''), p.handle) as name,
                 t.user_id = v_me as ich, t.tipp, t.at
            from public.lab_tipps t join public.profiles p on p.id = t.user_id
           where t.post_id = p_post
           order by t.at
           limit 100
        ) x
    ));
end
$fn$;

create or replace function public.lab_tippen(p_post uuid, p_tipp numeric)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if not exists (
    select 1 from public.posts
     where id = p_post and art = 'lab' and status = 'visible' and user_id <> v_me
       and daten->'eingaben' ? 'tipp'
  ) or not public.post_sichtbar(p_post, v_me) then
    raise exception 'Hier gibt es nichts zu schätzen';
  end if;
  insert into public.lab_tipps (post_id, user_id, tipp) values (p_post, v_me, p_tipp)
  on conflict do nothing;
  return public.lab_tipps(p_post);
end
$fn$;

revoke execute on function public.lab_tipps(uuid), public.lab_tippen(uuid, numeric) from anon;
grant execute on function public.lab_tipps(uuid), public.lab_tippen(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
