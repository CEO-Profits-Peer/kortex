-- =============================================================================
-- 0014_courses.sql  ·  Kurse
--
-- Der Gegenpol zum Feed: der Feed bedient den spontanen Scroll-Trieb, ein Kurs
-- ist eine gezielte Lern-Session mit Anfang und Ende.
--
-- Technisch bewusst dieselben content_items, nur mit content_type
-- 'course_lesson'. Das haelt den Renderer identisch - eine Lektion ist eine
-- Karte, nur in fester Reihenfolge. get_feed() filtert diesen Typ heraus,
-- damit Lektionen nicht einzeln im Feed auftauchen.
-- =============================================================================

create or replace function public.list_courses()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(row order by row->>'category_id', row->>'title'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',          co.id,
      'slug',        co.slug,
      'title',       co.title,
      'description', co.description,
      'category_id', co.category_id,
      'category',    c.display_name,
      'emoji',       c.emoji,
      'accent',      c.accent_hex,
      'difficulty',  co.difficulty,
      'premium',     co.is_premium,
      'lessons',     (select count(*) from public.course_lessons cl where cl.course_id = co.id),
      'position',    coalesce(ucp.current_position, 0),
      'started',     ucp.started_at is not null,
      'completed',   ucp.completed_at is not null
    ) as row
      from public.courses co
      join public.categories c on c.id = co.category_id
      left join public.user_course_progress ucp
             on ucp.course_id = co.id and ucp.user_id = auth.uid()
     where co.is_published
       and co.language = coalesce(
             (select language from public.profiles where id = auth.uid()), 'de')
  ) t;
$fn$;
grant execute on function public.list_courses() to authenticated;


create or replace function public.get_course_detail(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'id',          co.id,
    'slug',        co.slug,
    'title',       co.title,
    'description', co.description,
    'category_id', co.category_id,
    'category',    c.display_name,
    'emoji',       c.emoji,
    'accent',      c.accent_hex,
    'difficulty',  co.difficulty,
    'premium',     co.is_premium,
    'position',    coalesce(ucp.current_position, 0),
    'completed',   ucp.completed_at is not null,
    'lessons', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'position', cl.position,
               'title',    ci.title,
               'deck',     ci.deck,
               -- Erledigt heisst: vom Server als gelesen bestaetigt.
               'done',     coalesce(ucs.is_read_validated, false)
             ) order by cl.position), '[]'::jsonb)
        from public.course_lessons cl
        join public.content_items ci on ci.id = cl.content_id
        left join public.user_content_state ucs
               on ucs.content_id = ci.id and ucs.user_id = auth.uid()
       where cl.course_id = co.id
    )
  ) into v_out
  from public.courses co
  join public.categories c on c.id = co.category_id
  left join public.user_course_progress ucp
         on ucp.course_id = co.id and ucp.user_id = auth.uid()
  where co.slug = p_slug and co.is_published;

  if v_out is null then
    raise exception 'unknown course: %', p_slug;
  end if;
  return v_out;
end
$fn$;
grant execute on function public.get_course_detail(text) to authenticated;


-- Lektionen in fester Reihenfolge. Gleiche Rueckgabeform wie get_feed(),
-- damit derselbe Renderer sie darstellen kann.
create or replace function public.get_course_feed(p_course_id uuid)
returns setof public.content_items
language sql stable security definer set search_path = ''
as $fn$
  select ci.*
    from public.course_lessons cl
    join public.content_items ci on ci.id = cl.content_id
   where cl.course_id = p_course_id
   order by cl.position;
$fn$;
grant execute on function public.get_course_feed(uuid) to authenticated;


create or replace function public.start_course(p_course_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  insert into public.user_course_progress (user_id, course_id)
  values (v_user, p_course_id)
  on conflict (user_id, course_id) do nothing;
end
$fn$;
grant execute on function public.start_course(uuid) to authenticated;
