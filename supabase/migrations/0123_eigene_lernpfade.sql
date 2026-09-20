-- =============================================================================
-- 0123_eigene_lernpfade.sql  ·  PRO: den eigenen Pfad bauen
--
-- Die kuratierten Lernpfade (0112) sagen, in welcher Reihenfolge Kurse
-- aufeinander aufbauen. Mit PRO darf man sich selbst einen zusammenstellen:
-- Kurse in eine Reihenfolge bringen, benennen, abarbeiten.
--
-- Warum das PRO sein darf und trotzdem niemanden aussperrt: die Kurse
-- selbst, die kuratierten Pfade und jede Wiederholung bleiben frei. Was
-- PRO kostet, ist das ORDNEN - eine Bequemlichkeit, kein Zugang.
--
-- Grenzen: 10 Pfade, 15 Kurse je Pfad. Das ist kein Geiz, sondern eine
-- Liste, die man noch ueberblickt.
--
-- Der Fortschritt wird nicht gespeichert, sondern gerechnet - genau wie
-- bei den kuratierten Pfaden: fertig = als fertig markiert oder alle
-- Lektionen gelesen.
-- =============================================================================

create table if not exists public.eigene_pfade (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  titel      text not null check (length(btrim(titel)) between 2 and 60),
  created_at timestamptz not null default now()
);
create index if not exists eigene_pfade_user_idx on public.eigene_pfade (user_id, created_at);

create table if not exists public.eigene_pfad_kurse (
  pfad_id   uuid not null references public.eigene_pfade(id) on delete cascade,
  position  smallint not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  primary key (pfad_id, position),
  unique (pfad_id, course_id)
);

alter table public.eigene_pfade enable row level security;
alter table public.eigene_pfad_kurse enable row level security;
revoke all on public.eigene_pfade, public.eigene_pfad_kurse from anon, authenticated;

create or replace function public.eigener_pfad_meiner(p_pfad uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from public.eigene_pfade where id = p_pfad and user_id = auth.uid());
$fn$;
revoke execute on function public.eigener_pfad_meiner(uuid) from anon, authenticated;

create or replace function public.eigenen_pfad_anlegen(p_titel text)
returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;
  if not public.ist_pro(v_me) then raise exception 'PRO: Eigene Lernpfade gibt es mit PRO.'; end if;
  if public.post_rejection(coalesce(p_titel, '')) is not null then raise exception 'Dieser Titel geht nicht'; end if;
  if (select count(*) from public.eigene_pfade where user_id = v_me) >= 10 then
    raise exception 'Höchstens zehn eigene Lernpfade';
  end if;
  insert into public.eigene_pfade (user_id, titel) values (v_me, btrim(p_titel)) returning id into v_id;
  return v_id;
end
$fn$;

-- Kurs ans Ende haengen oder herausnehmen. Beim Herausnehmen ruecken die
-- folgenden auf - sonst entstehen Luecken in der Reihenfolge, und die
-- naechste Station waere "Nummer 4 von 3".
create or replace function public.eigenen_pfad_kurs(p_pfad uuid, p_course uuid, p_rein boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_pos smallint;
begin
  if not public.eigener_pfad_meiner(p_pfad) then raise exception 'Nicht dein Pfad'; end if;
  if p_rein then
    if not exists (select 1 from public.courses where id = p_course and is_published) then
      raise exception 'Diesen Kurs gibt es nicht';
    end if;
    if (select count(*) from public.eigene_pfad_kurse where pfad_id = p_pfad) >= 15 then
      raise exception 'Höchstens fünfzehn Kurse je Pfad';
    end if;
    select coalesce(max(position), 0) + 1 into v_pos from public.eigene_pfad_kurse where pfad_id = p_pfad;
    insert into public.eigene_pfad_kurse (pfad_id, position, course_id)
    values (p_pfad, v_pos, p_course)
    on conflict (pfad_id, course_id) do nothing;
  else
    select position into v_pos from public.eigene_pfad_kurse
     where pfad_id = p_pfad and course_id = p_course;
    if v_pos is null then return; end if;
    delete from public.eigene_pfad_kurse where pfad_id = p_pfad and course_id = p_course;
    update public.eigene_pfad_kurse set position = position - 1
     where pfad_id = p_pfad and position > v_pos;
  end if;
end
$fn$;

-- Eine Station nach oben oder unten. Ueber eine Zwischenposition, weil
-- (pfad_id, position) eindeutig ist: direktes Tauschen kollidiert.
create or replace function public.eigenen_pfad_schieben(p_pfad uuid, p_course uuid, p_hoch boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_pos    smallint;
  v_ziel   smallint;
  v_andere uuid;
begin
  if not public.eigener_pfad_meiner(p_pfad) then raise exception 'Nicht dein Pfad'; end if;
  select position into v_pos from public.eigene_pfad_kurse
   where pfad_id = p_pfad and course_id = p_course;
  if v_pos is null then return; end if;
  v_ziel := case when p_hoch then v_pos - 1 else v_pos + 1 end;
  select course_id into v_andere from public.eigene_pfad_kurse
   where pfad_id = p_pfad and position = v_ziel;
  if v_andere is null then return; end if;

  update public.eigene_pfad_kurse set position = -1 where pfad_id = p_pfad and course_id = p_course;
  update public.eigene_pfad_kurse set position = v_pos where pfad_id = p_pfad and course_id = v_andere;
  update public.eigene_pfad_kurse set position = v_ziel where pfad_id = p_pfad and course_id = p_course;
end
$fn$;

create or replace function public.eigenen_pfad_loeschen(p_pfad uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  delete from public.eigene_pfade where id = p_pfad and user_id = auth.uid();
$fn$;

create or replace function public.meine_eigenen_pfade()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'titel', p.titel,
           'kurse', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'position', k.position, 'course_id', co.id, 'slug', co.slug,
                      'title', co.title, 'accent', c.accent_hex, 'emoji', c.emoji,
                      'lessons', l.gesamt, 'gelesen', l.gelesen,
                      'fertig', ucp.completed_at is not null or (l.gesamt > 0 and l.gelesen >= l.gesamt))
                    order by k.position)
               from public.eigene_pfad_kurse k
               join public.courses co on co.id = k.course_id and co.is_published
               join public.categories c on c.id = co.category_id
               left join public.user_course_progress ucp
                      on ucp.course_id = co.id and ucp.user_id = auth.uid()
               cross join lateral (
                 select count(*)::int as gesamt,
                        (count(*) filter (where coalesce(ucs.is_read_validated, false)))::int as gelesen
                   from public.course_lessons cl
                   left join public.user_content_state ucs
                          on ucs.content_id = cl.content_id and ucs.user_id = auth.uid()
                  where cl.course_id = co.id
               ) l
              where k.pfad_id = p.id), '[]'::jsonb))
         order by p.created_at), '[]'::jsonb)
    from public.eigene_pfade p
   where p.user_id = auth.uid();
$fn$;

revoke execute on function public.eigenen_pfad_anlegen(text), public.eigenen_pfad_kurs(uuid, uuid, boolean),
  public.eigenen_pfad_schieben(uuid, uuid, boolean), public.eigenen_pfad_loeschen(uuid),
  public.meine_eigenen_pfade() from anon;
grant execute on function public.eigenen_pfad_anlegen(text), public.eigenen_pfad_kurs(uuid, uuid, boolean),
  public.eigenen_pfad_schieben(uuid, uuid, boolean), public.eigenen_pfad_loeschen(uuid),
  public.meine_eigenen_pfade() to authenticated;

do $test$
declare
  v_id uuid;
  v_p  uuid;
  v_k1 uuid;
  v_k2 uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  select id into v_k1 from public.courses where is_published order by created_at limit 1;
  select id into v_k2 from public.courses where is_published and id <> v_k1 order by created_at limit 1;
  if v_id is null or v_k2 is null then raise notice 'Selbsttest 0123: zu wenig Daten'; return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    -- Ohne PRO muss es scheitern.
    if public.ist_pro(v_id) then
      raise notice 'Selbsttest 0123: Konto ist PRO, PRO-Sperre nicht pruefbar';
    else
      begin
        perform public.eigenen_pfad_anlegen('Selbsttest');
        raise exception 'Selbsttest 0123: ohne PRO angelegt';
      exception when others then
        if sqlerrm not like 'PRO:%' then raise; end if;
      end;
    end if;

    -- Mit PRO: anlegen, zwei Kurse, tauschen, einen raus.
    update public.profiles set plan = 'gifted', plan_expires_at = now() + interval '1 day' where id = v_id;
    v_p := public.eigenen_pfad_anlegen('Selbsttest Pfad');
    perform public.eigenen_pfad_kurs(v_p, v_k1, true);
    perform public.eigenen_pfad_kurs(v_p, v_k2, true);
    perform public.eigenen_pfad_schieben(v_p, v_k2, true);
    v_j := public.meine_eigenen_pfade();
    if (v_j->0->'kurse'->0->>'course_id')::uuid <> v_k2 then
      raise exception 'Selbsttest 0123: Reihenfolge falsch: %', v_j;
    end if;
    perform public.eigenen_pfad_kurs(v_p, v_k2, false);
    v_j := public.meine_eigenen_pfade();
    if jsonb_array_length(v_j->0->'kurse') <> 1 or (v_j->0->'kurse'->0->>'position')::int <> 1 then
      raise exception 'Selbsttest 0123: Aufruecken falsch: %', v_j;
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0123: ok';
end
$test$;

notify pgrst, 'reload schema';
