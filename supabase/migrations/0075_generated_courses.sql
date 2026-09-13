-- =============================================================================
-- 0075_generated_courses.sql  ·  Kurse, die die Pipeline baut
--
-- Bis hier gab es genau einen Kurs, von Hand geschrieben (seed/0005). Jetzt
-- baut pipeline/courses.py Kurse aus Wikipedia-Artikeln: erst den Bogen
-- (make_course_arc), dann jede Lektion als ganz normale, gepruefte Karte.
-- Dafuer braucht es drei Dinge in der Datenbank - und beim Hinsehen fielen
-- zwei Fehler in 0014 auf, die bisher niemand bemerkt hat, weil es nur
-- einen Kurs gab.
--
-- 1. Woher ein Kurs stammt
--    `source_url` und `generated`. Ohne die Quelle wuerde derselbe Artikel
--    bei jedem Lauf wieder ein Kurs. Der Index ist eindeutig je Sprache,
--    damit auch zwei gleichzeitige Laeufe keine Dublette schreiben koennen.
--
-- 2. Fehler: Kurse nach der App-Sprache statt nach der Mischung
--    list_courses filterte auf profiles.language. Das ist seit 0029 die
--    falsche Spalte - welche Sprachen jemand lesen will, sagt der Regler
--    (feed_english_pct), nicht die Oberflaeche. Wer "Nur Englisch" wollte
--    und die App auf Deutsch hatte, bekam deutsche Kurse; wer "EN" als
--    App-Sprache hatte, gar keinen, weil es nur einen deutschen gab. Jetzt
--    dieselbe Funktion wie im Feed: user_feed_languages().
--
-- 3. Fehler: Fortschritt, der sich nie bewegt
--    'position' kam aus user_course_progress.current_position - und diese
--    Spalte schreibt NIEMAND. start_course legt die Zeile mit 0 an, danach
--    passiert nichts. Der Balken in der Kursuebersicht stand deshalb fuer
--    alle immer auf null, waehrend die Detailseite (die gelesene Lektionen
--    zaehlt) richtig "3 von 5" zeigte. Jetzt zaehlen beide dasselbe:
--    serverseitig bestaetigt gelesene Lektionen. Die Spalte bleibt, wird
--    aber nicht mehr gelesen - eine zweite Wahrheit, die man pflegen muss,
--    ist schlechter als eine, die man ausrechnet.
--
-- Beide Funktionen sind vollstaendig aus 0014 uebernommen (dort ihre
-- einzige Fassung), mit genau diesen Aenderungen und dem neuen Feld
-- 'language'.
-- =============================================================================

-- --- Laufbilanz kennt ein viertes Skript ------------------------------------
alter table public.pipeline_runs drop constraint if exists pipeline_runs_skript_check;
alter table public.pipeline_runs add constraint pipeline_runs_skript_check
  check (skript in ('ingest', 'evergreen', 'backfill', 'kurse'));


-- --- Herkunft ----------------------------------------------------------------
alter table public.courses add column if not exists source_url text;
alter table public.courses add column if not exists generated boolean not null default false;

create unique index if not exists courses_source_uidx
  on public.courses (language, source_url)
  where source_url is not null;

comment on column public.courses.source_url is
  'Der Artikel, aus dem pipeline/courses.py den Kurs gebaut hat. Leer bei Handarbeit.';


-- --- Kursliste ---------------------------------------------------------------
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
      'language',    co.language,
      'lessons',     l.gesamt,
      'position',    l.gelesen,
      'started',     ucp.started_at is not null or l.gelesen > 0,
      'completed',   ucp.completed_at is not null or (l.gesamt > 0 and l.gelesen >= l.gesamt)
    ) as row
      from public.courses co
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
     where co.is_published
       and co.language = any(public.user_feed_languages(auth.uid()))
  ) t;
$fn$;
grant execute on function public.list_courses() to authenticated;


-- --- Kursdetail --------------------------------------------------------------
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
    'language',    co.language,
    'position',    l.gelesen,
    'completed',   ucp.completed_at is not null or (l.gesamt > 0 and l.gelesen >= l.gesamt),
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
  cross join lateral (
    select count(*)::int as gesamt,
           (count(*) filter (where coalesce(ucs.is_read_validated, false)))::int as gelesen
      from public.course_lessons cl
      left join public.user_content_state ucs
             on ucs.content_id = cl.content_id and ucs.user_id = auth.uid()
     where cl.course_id = co.id
  ) l
  where co.slug = p_slug and co.is_published;

  if v_out is null then
    raise exception 'unknown course: %', p_slug;
  end if;
  return v_out;
end
$fn$;
grant execute on function public.get_course_detail(text) to authenticated;

notify pgrst, 'reload schema';
