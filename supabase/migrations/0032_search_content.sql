-- =============================================================================
-- 0032_search_content.sql  ·  Karten nach Inhalt finden, nicht nur nach Titel
--
-- Was fehlte
-- ----------
-- "Sonne" fand nichts, obwohl es eine Karte ueber die Lichtlaufzeit von der
-- Sonne gibt - ihr Titel heisst "Acht Minuten Verspaetung". Gesucht wurde
-- bisher nur in `title`, und ein guter Titel enthaelt selten das Suchwort.
-- Genau deshalb ist er ein guter Titel.
--
-- Was jetzt durchsucht wird
-- -------------------------
-- Titel, Unterzeile UND der Text der Karte - also das, woran sich jemand
-- erinnert. Dazu die Schlagworte aus `media->tags`.
--
-- Warum eine erzeugte Spalte statt `ilike` auf dem JSON
-- -----------------------------------------------------
-- Der Kartentext steckt in `body_blocks`, einem JSON-Feld mit
-- unterschiedlich gebauten Bloecken. Bei jeder Suche durch dieses JSON zu
-- laufen, hiesse: jede Karte einzeln auspacken, jedes Mal. Das geht bei
-- vierzig Karten und faellt bei viertausend um.
--
-- Stattdessen eine erzeugte Spalte: Postgres haelt den durchsuchbaren Text
-- bei jedem Schreiben aktuell, und ein GIN-Index macht die Suche darin
-- schnell. Kosten: etwas Speicher. Nutzen: die Suche bleibt schnell, egal
-- wie viel die Pipeline nachliefert.
--
-- Warum Trigramme und keine Volltextsuche
-- ---------------------------------------
-- `to_tsvector` braucht eine Sprachkonfiguration, und der Bestand ist
-- zweisprachig - deutsche Wortstammzerlegung auf einen englischen Text
-- angewandt liefert Unsinn. Trigramme sind sprachblind, finden Teilworte
-- ("zins" in "Zinseszins") und verzeihen Tippfehler. Fuer eine Suche ueber
-- kurze Karten ist das die passendere Wahl - und pg_trgm ist ohnehin schon
-- installiert.
-- =============================================================================

-- --- Der durchsuchbare Text -------------------------------------------------
--
-- Als Funktion und nicht direkt in der Spalte: erzeugte Spalten duerfen
-- keine Unterabfragen enthalten, und ohne Unterabfrage kommt man an den
-- Text in einem JSON-Feld nicht heran.
--
-- `immutable` ist hier keine Behauptung ins Blaue: das Ergebnis haengt
-- ausschliesslich von den uebergebenen Werten ab. Genau das verlangt
-- Postgres fuer eine erzeugte Spalte.
create or replace function public.content_search_text(
  p_title  text,
  p_deck   text,
  p_blocks jsonb,
  p_media  jsonb
) returns text
language sql immutable
as $fn$
  select concat_ws(' ',
    coalesce(p_title, ''),
    coalesce(p_deck, ''),
    -- Alle Textfelder aller Bloecke: 'para' und 'quote' haben `text`,
    -- 'bullet' hat `items`, 'stat' hat `value` und `label`.
    (select string_agg(
              concat_ws(' ',
                b ->> 'text',
                b ->> 'value',
                b ->> 'label',
                b ->> 'attribution',
                (select string_agg(i, ' ')
                   from jsonb_array_elements_text(
                          case when jsonb_typeof(b -> 'items') = 'array'
                               then b -> 'items' else '[]'::jsonb end) i)
              ), ' ')
       from jsonb_array_elements(
              case when jsonb_typeof(p_blocks) = 'array'
                   then p_blocks else '[]'::jsonb end) b),
    (select string_agg(t, ' ')
       from jsonb_array_elements_text(
              case when jsonb_typeof(p_media -> 'tags') = 'array'
                   then p_media -> 'tags' else '[]'::jsonb end) t)
  );
$fn$;

alter table public.content_items
  add column if not exists search_text text
  generated always as (
    public.content_search_text(title, deck, body_blocks, media)
  ) stored;

comment on column public.content_items.search_text is
  'Titel, Unterzeile, Kartentext und Schlagworte in einem Feld. Von Postgres '
  'gepflegt - nie von Hand schreiben. Grundlage der Inhaltssuche (0032).';


-- --- Der Index --------------------------------------------------------------
do $do$
declare v_ext_schema text;
begin
  select n.nspname into v_ext_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  execute format(
    'create index if not exists content_items_search_trgm_idx '
    'on public.content_items using gin (search_text %I.gin_trgm_ops) '
    'where status = ''approved''',
    v_ext_schema
  );
end $do$;


-- =============================================================================
-- Die Suche
--
-- Der Karten-Zweig sucht jetzt im ganzen Text. Die Bewertung bleibt
-- gestaffelt, damit ein Titeltreffer weiter vor einem Treffer im
-- Fliesstext steht - wer "Sonne" sucht, will die Karte UEBER die Sonne
-- zuerst, nicht die, in der sie nebenbei vorkommt.
-- =============================================================================
create or replace function public.search_all(p_query text, p_limit int default 20)
returns table (
  kind text, id text, title text, subtitle text, meta jsonb, score real
)
language sql security definer
as $fn$
  with q as (select trim(both from p_query) as raw,
                    lower(regexp_replace(trim(both from p_query), '^[@#]', '')) as term)
  select * from (
    -- #kategorien
    select 'category'::text, c.id, c.display_name,
           coalesce(c.description, ''),
           jsonb_build_object('emoji', c.emoji, 'slug', c.slug,
                              'levelable', c.is_levelable, 'accent', c.accent_hex),
           (similarity(c.slug, (select term from q)) * 1.4)::real
      from public.categories c, q
     where c.is_active and (q.raw not like '@%')
       and (c.slug % q.term or c.display_name ilike '%' || q.term || '%')

    union all
    -- @quellen
    select 'source', s.id, s.display_name, s.handle,
           jsonb_build_object('logo', s.logo_url, 'license', s.license_class,
                              'trust', s.trust_score),
           (similarity(s.handle, (select term from q)) * 1.2)::real
      from public.sources s, q
     where s.is_active and (q.raw not like '#%')
       and (s.handle % q.term or s.display_name ilike '%' || q.term || '%')

    union all
    -- @nutzer  ·  Handle und Anzeigename
    select 'profile', pp.id::text,
           coalesce(nullif(trim(pp.display_name), ''), pp.handle),
           '@' || pp.handle,
           jsonb_build_object('avatar_seed', pp.avatar_seed, 'mastery', pp.mastery_total),
           greatest(
             similarity(pp.handle, (select term from q)),
             case
               when lower(coalesce(pp.display_name, '')) like (select term from q) || '%'
                 then 0.9
               when lower(coalesce(pp.display_name, '')) like '%' || (select term from q) || '%'
                 then 0.6
               else 0
             end
           )::real
      from public.public_profiles pp, q
     where q.raw not like '#%'
       and (pp.handle % q.term or pp.display_name ilike '%' || q.term || '%')

    union all
    -- Kurse
    select 'course', co.id::text, co.title, co.description,
           jsonb_build_object('category', co.category_id, 'difficulty', co.difficulty,
                              'premium', co.is_premium),
           (similarity(co.slug, (select term from q)) * 1.1)::real
      from public.courses co, q
     where co.is_published and (co.slug % q.term or co.title ilike '%' || q.term || '%')

    union all
    -- Karten  ·  jetzt im ganzen Text
    select 'content', ci.id::text, ci.title, coalesce(ci.deck, ''),
           jsonb_build_object('category', ci.primary_category_id, 'type', ci.content_type,
                              'mode', ci.presentation_mode),
           (case
              -- Im Titel: der eindeutigste Treffer.
              when ci.title ilike '%' || q.term || '%' then 0.95
              -- In der Unterzeile: fast so gut, die fasst die Karte zusammen.
              when coalesce(ci.deck, '') ilike '%' || q.term || '%' then 0.8
              -- Irgendwo im Text: gefunden ist besser als nicht gefunden,
              -- aber es steht hinter allem, was den Begriff im Titel hat.
              else 0.5
            end)::real
      from public.content_items ci, q
     where ci.status = 'approved'
       and (q.raw not like '@%') and (q.raw not like '#%')
       and ci.search_text ilike '%' || q.term || '%'
  ) hits(kind, id, title, subtitle, meta, score)
  order by score desc
  limit p_limit;
$fn$;

do $do$
declare v_ext_schema text;
begin
  select n.nspname into v_ext_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format('alter function public.search_all(text, int) set search_path = %I, pg_temp',
                 v_ext_schema);
end $do$;

grant execute on function public.search_all(text, int) to authenticated;
