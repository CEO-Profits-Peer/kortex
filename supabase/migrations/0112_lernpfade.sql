-- =============================================================================
-- 0112_lernpfade.sql  ·  Mehrere Kurse in einer sinnvollen Reihenfolge
--
-- Ein Kurs erklaert EIN Thema in fuenf Lektionen. Ein Lernpfad reiht Kurse
-- so, dass jeder auf dem davor aufbaut: "Geld verstehen" geht vom Girokonto
-- ueber Zinseszins und Inflation zu Aktien, Streuung und Steuern.
--
-- Die Pfade sind von Hand kuratiert (unten), die Stationen sind Wikipedia-
-- Artikel. Die Kurse dazu baut pipeline/courses.py: Stationen ohne Kurs
-- kommen VOR allen anderen Kurs-Kandidaten dran. Die Verbindung Station ->
-- Kurs ist (Sprache, source_url) - genau der eindeutige Index aus 0075, also
-- ohne eigene Spalte, die aus dem Tritt geraten koennte.
--
-- Stationen sind nicht gesperrt: man darf springen. Der Pfad schlaegt nur
-- vor, was als naechstes dran ist (die erste nicht fertige Station).
--
-- Scheitert eine Station dreimal (Artikel zu kurz, kein Bogen), laesst die
-- Pipeline sie liegen, statt jeden Lauf daran Kontingent zu verbrennen.
-- =============================================================================

create table if not exists public.lernpfade (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  language     text not null check (language in ('de', 'en')),
  titel        text not null,
  beschreibung text not null,
  category_id  text not null references public.categories(id),
  sort         smallint not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.lernpfad_stationen (
  pfad_id      uuid not null references public.lernpfade(id) on delete cascade,
  position     smallint not null,
  lemma        text not null,
  url          text not null,
  category_id  text not null references public.categories(id),
  fehlversuche smallint not null default 0,
  primary key (pfad_id, position)
);

alter table public.lernpfade enable row level security;
alter table public.lernpfad_stationen enable row level security;
revoke all on public.lernpfade, public.lernpfad_stationen from anon, authenticated;


-- Fortschritt je Station fuer den angemeldeten Nutzer. Dieselbe Rechnung wie
-- list_courses (0075): fertig = als fertig markiert oder alle Lektionen gelesen.
create or replace function public.lernpfad_stand(p_pfad uuid)
returns table (
  pos smallint, lemma text, category_id text,
  course_id uuid, slug text, title text, lessons int, gelesen int, fertig boolean
)
language sql stable security definer set search_path = ''
as $fn$
  select s.position, s.lemma, s.category_id,
         co.id, co.slug, co.title,
         coalesce(l.gesamt, 0), coalesce(l.gelesen, 0),
         co.id is not null and (ucp.completed_at is not null or (l.gesamt > 0 and l.gelesen >= l.gesamt))
    from public.lernpfad_stationen s
    join public.lernpfade p on p.id = s.pfad_id
    left join public.courses co
           on co.language = p.language and co.source_url = s.url and co.is_published
    left join public.user_course_progress ucp
           on ucp.course_id = co.id and ucp.user_id = auth.uid()
    left join lateral (
      select count(*)::int as gesamt,
             (count(*) filter (where coalesce(ucs.is_read_validated, false)))::int as gelesen
        from public.course_lessons cl
        left join public.user_content_state ucs
               on ucs.content_id = cl.content_id and ucs.user_id = auth.uid()
       where cl.course_id = co.id
    ) l on co.id is not null
   where s.pfad_id = p_pfad
   order by s.position;
$fn$;
revoke execute on function public.lernpfad_stand(uuid) from anon, authenticated;

create or replace function public.list_lernpfade()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x order by (x->>'sort')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', p.id, 'slug', p.slug, 'titel', p.titel, 'beschreibung', p.beschreibung,
               'sort', p.sort, 'language', p.language,
               'accent', c.accent_hex, 'emoji', c.emoji,
               'stationen', st.anzahl, 'bereit', st.bereit, 'fertig', st.fertig,
               'naechste', st.naechste) as x
        from public.lernpfade p
        join public.categories c on c.id = p.category_id
        cross join lateral (
          select count(*)::int as anzahl,
                 count(*) filter (where s.course_id is not null)::int as bereit,
                 count(*) filter (where s.fertig)::int as fertig,
                 (select s2.title from public.lernpfad_stand(p.id) s2
                   where s2.course_id is not null and not s2.fertig
                   order by s2.pos limit 1) as naechste
            from public.lernpfad_stand(p.id) s
        ) st
       where p.language = any (public.user_feed_languages(auth.uid()))
    ) t;
$fn$;

create or replace function public.get_lernpfad(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
           'id', p.id, 'slug', p.slug, 'titel', p.titel, 'beschreibung', p.beschreibung,
           'accent', c.accent_hex, 'emoji', c.emoji,
           'stationen', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'position', s.pos, 'lemma', s.lemma, 'category_id', s.category_id,
                      'course_slug', s.slug, 'title', s.title,
                      'lessons', s.lessons, 'gelesen', s.gelesen, 'fertig', s.fertig)
                    order by s.pos)
               from public.lernpfad_stand(p.id) s), '[]'::jsonb))
    from public.lernpfade p
    join public.categories c on c.id = p.category_id
   where p.slug = p_slug;
$fn$;

revoke execute on function public.list_lernpfade(), public.get_lernpfad(text) from anon;
grant execute on function public.list_lernpfade(), public.get_lernpfad(text) to authenticated;


-- --- Die Pfade -----------------------------------------------------------------
insert into public.lernpfade (slug, language, titel, beschreibung, category_id, sort) values
  ('geld-verstehen', 'de', 'Geld verstehen', 'Vom Girokonto bis zur Steuer – in der Reihenfolge, in der man es im Leben braucht.', 'finance', 0),
  ('wie-lernen-funktioniert', 'de', 'Wie Lernen funktioniert', 'Von der Nervenzelle bis zum Lernen über das eigene Lernen.', 'mind', 1),
  ('ki-verstehen', 'de', 'KI verstehen', 'Was ein Algorithmus ist – und wie daraus ein Sprachmodell wird.', 'tech', 2),
  ('das-universum', 'de', 'Das Universum', 'Von unserem Sonnensystem zurück bis zum Urknall.', 'science', 3),
  ('klimawandel', 'de', 'Klimawandel', 'Wie der Treibhauseffekt funktioniert und was die Welt dagegen vereinbart hat.', 'science', 4),
  ('bausteine-des-lebens', 'de', 'Bausteine des Lebens', 'Zelle, DNA, Photosynthese, Evolution – wie Leben funktioniert.', 'science', 5),
  ('demokratie', 'de', 'Wie Demokratie entstand', 'Von Athen über die Aufklärung bis zum Wahlrecht für alle.', 'history', 6),
  ('understanding-money', 'en', 'Understanding Money', 'From your first account to taxes – in the order life asks for it.', 'finance', 7),
  ('how-learning-works', 'en', 'How Learning Works', 'From the neuron to thinking about your own thinking.', 'mind', 8),
  ('understanding-ai', 'en', 'Understanding AI', 'What an algorithm is – and how it grows into a language model.', 'tech', 9),
  ('the-universe', 'en', 'The Universe', 'From our Solar System back to the Big Bang.', 'science', 10),
  ('climate-change', 'en', 'Climate Change', 'How the greenhouse effect works and what the world agreed to do.', 'science', 11),
  ('building-blocks-of-life', 'en', 'Building Blocks of Life', 'Cell, DNA, photosynthesis, evolution – how life works.', 'science', 12),
  ('how-democracy-began', 'en', 'How Democracy Began', 'From Athens through the Enlightenment to votes for all.', 'history', 13)
on conflict (slug) do nothing;

insert into public.lernpfad_stationen (pfad_id, position, lemma, url, category_id)
select p.id, v.position, v.lemma, v.url, v.category_id
  from (values
  ('geld-verstehen', 1, 'Girokonto', 'https://de.wikipedia.org/wiki/Girokonto', 'finance.basics'),
  ('geld-verstehen', 2, 'Zinseszins', 'https://de.wikipedia.org/wiki/Zinseszins', 'finance.compound'),
  ('geld-verstehen', 3, 'Inflation', 'https://de.wikipedia.org/wiki/Inflation', 'finance.macro'),
  ('geld-verstehen', 4, 'Aktie', 'https://de.wikipedia.org/wiki/Aktie', 'finance.markets'),
  ('geld-verstehen', 5, 'Diversifikation (Wirtschaft)', 'https://de.wikipedia.org/wiki/Diversifikation_%28Wirtschaft%29', 'finance.markets'),
  ('geld-verstehen', 6, 'Steuerprogression', 'https://de.wikipedia.org/wiki/Steuerprogression', 'finance.taxes'),
  ('wie-lernen-funktioniert', 1, 'Nervenzelle', 'https://de.wikipedia.org/wiki/Nervenzelle', 'science.neuro'),
  ('wie-lernen-funktioniert', 2, 'Gedächtnis', 'https://de.wikipedia.org/wiki/Ged%C3%A4chtnis', 'mind.learning'),
  ('wie-lernen-funktioniert', 3, 'Schlaf', 'https://de.wikipedia.org/wiki/Schlaf', 'body.sleep'),
  ('wie-lernen-funktioniert', 4, 'Metakognition', 'https://de.wikipedia.org/wiki/Metakognition', 'mind.learning'),
  ('ki-verstehen', 1, 'Algorithmus', 'https://de.wikipedia.org/wiki/Algorithmus', 'tech.code'),
  ('ki-verstehen', 2, 'Maschinelles Lernen', 'https://de.wikipedia.org/wiki/Maschinelles_Lernen', 'tech.ai'),
  ('ki-verstehen', 3, 'Künstliches neuronales Netz', 'https://de.wikipedia.org/wiki/K%C3%BCnstliches_neuronales_Netz', 'tech.ai'),
  ('ki-verstehen', 4, 'Large Language Model', 'https://de.wikipedia.org/wiki/Large_Language_Model', 'tech.ai'),
  ('das-universum', 1, 'Sonnensystem', 'https://de.wikipedia.org/wiki/Sonnensystem', 'science.space'),
  ('das-universum', 2, 'Stern', 'https://de.wikipedia.org/wiki/Stern', 'science.space'),
  ('das-universum', 3, 'Schwarzes Loch', 'https://de.wikipedia.org/wiki/Schwarzes_Loch', 'science.space'),
  ('das-universum', 4, 'Urknall', 'https://de.wikipedia.org/wiki/Urknall', 'science.space'),
  ('klimawandel', 1, 'Treibhauseffekt', 'https://de.wikipedia.org/wiki/Treibhauseffekt', 'science.climate'),
  ('klimawandel', 2, 'Kohlenstoffkreislauf', 'https://de.wikipedia.org/wiki/Kohlenstoffkreislauf', 'science.climate'),
  ('klimawandel', 3, 'Globale Erwärmung', 'https://de.wikipedia.org/wiki/Globale_Erw%C3%A4rmung', 'science.climate'),
  ('klimawandel', 4, 'Übereinkommen von Paris', 'https://de.wikipedia.org/wiki/%C3%9Cbereinkommen_von_Paris', 'science.climate'),
  ('bausteine-des-lebens', 1, 'Zelle (Biologie)', 'https://de.wikipedia.org/wiki/Zelle_%28Biologie%29', 'science.bio'),
  ('bausteine-des-lebens', 2, 'Desoxyribonukleinsäure', 'https://de.wikipedia.org/wiki/Desoxyribonukleins%C3%A4ure', 'science.bio'),
  ('bausteine-des-lebens', 3, 'Photosynthese', 'https://de.wikipedia.org/wiki/Photosynthese', 'science.bio'),
  ('bausteine-des-lebens', 4, 'Evolution', 'https://de.wikipedia.org/wiki/Evolution', 'science.bio'),
  ('demokratie', 1, 'Attische Demokratie', 'https://de.wikipedia.org/wiki/Attische_Demokratie', 'history.early'),
  ('demokratie', 2, 'Aufklärung', 'https://de.wikipedia.org/wiki/Aufkl%C3%A4rung', 'history.modern'),
  ('demokratie', 3, 'Gewaltenteilung', 'https://de.wikipedia.org/wiki/Gewaltenteilung', 'history.democracy'),
  ('demokratie', 4, 'Menschenrechte', 'https://de.wikipedia.org/wiki/Menschenrechte', 'life.rights'),
  ('demokratie', 5, 'Wahlrecht', 'https://de.wikipedia.org/wiki/Wahlrecht', 'history.democracy'),
  ('understanding-money', 1, 'Transaction account', 'https://en.wikipedia.org/wiki/Transaction_account', 'finance.basics'),
  ('understanding-money', 2, 'Compound interest', 'https://en.wikipedia.org/wiki/Compound_interest', 'finance.compound'),
  ('understanding-money', 3, 'Inflation', 'https://en.wikipedia.org/wiki/Inflation', 'finance.macro'),
  ('understanding-money', 4, 'Stock', 'https://en.wikipedia.org/wiki/Stock', 'finance.markets'),
  ('understanding-money', 5, 'Diversification (finance)', 'https://en.wikipedia.org/wiki/Diversification_%28finance%29', 'finance.markets'),
  ('understanding-money', 6, 'Progressive tax', 'https://en.wikipedia.org/wiki/Progressive_tax', 'finance.taxes'),
  ('how-learning-works', 1, 'Neuron', 'https://en.wikipedia.org/wiki/Neuron', 'science.neuro'),
  ('how-learning-works', 2, 'Memory', 'https://en.wikipedia.org/wiki/Memory', 'mind.learning'),
  ('how-learning-works', 3, 'Sleep', 'https://en.wikipedia.org/wiki/Sleep', 'body.sleep'),
  ('how-learning-works', 4, 'Spacing effect', 'https://en.wikipedia.org/wiki/Spacing_effect', 'mind.learning'),
  ('how-learning-works', 5, 'Metacognition', 'https://en.wikipedia.org/wiki/Metacognition', 'mind.learning'),
  ('understanding-ai', 1, 'Algorithm', 'https://en.wikipedia.org/wiki/Algorithm', 'tech.code'),
  ('understanding-ai', 2, 'Machine learning', 'https://en.wikipedia.org/wiki/Machine_learning', 'tech.ai'),
  ('understanding-ai', 3, 'Neural network (machine learning)', 'https://en.wikipedia.org/wiki/Neural_network_%28machine_learning%29', 'tech.ai'),
  ('understanding-ai', 4, 'Large language model', 'https://en.wikipedia.org/wiki/Large_language_model', 'tech.ai'),
  ('the-universe', 1, 'Solar System', 'https://en.wikipedia.org/wiki/Solar_System', 'science.space'),
  ('the-universe', 2, 'Star', 'https://en.wikipedia.org/wiki/Star', 'science.space'),
  ('the-universe', 3, 'Black hole', 'https://en.wikipedia.org/wiki/Black_hole', 'science.space'),
  ('the-universe', 4, 'Big Bang', 'https://en.wikipedia.org/wiki/Big_Bang', 'science.space'),
  ('climate-change', 1, 'Greenhouse effect', 'https://en.wikipedia.org/wiki/Greenhouse_effect', 'science.climate'),
  ('climate-change', 2, 'Carbon cycle', 'https://en.wikipedia.org/wiki/Carbon_cycle', 'science.climate'),
  ('climate-change', 3, 'Climate change', 'https://en.wikipedia.org/wiki/Climate_change', 'science.climate'),
  ('climate-change', 4, 'Paris Agreement', 'https://en.wikipedia.org/wiki/Paris_Agreement', 'science.climate'),
  ('building-blocks-of-life', 1, 'Cell (biology)', 'https://en.wikipedia.org/wiki/Cell_%28biology%29', 'science.bio'),
  ('building-blocks-of-life', 2, 'DNA', 'https://en.wikipedia.org/wiki/DNA', 'science.bio'),
  ('building-blocks-of-life', 3, 'Photosynthesis', 'https://en.wikipedia.org/wiki/Photosynthesis', 'science.bio'),
  ('building-blocks-of-life', 4, 'Evolution', 'https://en.wikipedia.org/wiki/Evolution', 'science.bio'),
  ('how-democracy-began', 1, 'Athenian democracy', 'https://en.wikipedia.org/wiki/Athenian_democracy', 'history.early'),
  ('how-democracy-began', 2, 'Age of Enlightenment', 'https://en.wikipedia.org/wiki/Age_of_Enlightenment', 'history.modern'),
  ('how-democracy-began', 3, 'Separation of powers', 'https://en.wikipedia.org/wiki/Separation_of_powers', 'history.democracy'),
  ('how-democracy-began', 4, 'Human rights', 'https://en.wikipedia.org/wiki/Human_rights', 'life.rights')
  ) as v(slug, position, lemma, url, category_id)
  join public.lernpfade p on p.slug = v.slug
on conflict (pfad_id, position) do nothing;


do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0112: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  v_j := public.list_lernpfade();
  if jsonb_array_length(v_j) < 1 then raise exception 'Selbsttest 0112: keine Pfade: %', v_j; end if;
  v_j := public.get_lernpfad(v_j->0->>'slug');
  if jsonb_array_length(v_j->'stationen') < 3 then raise exception 'Selbsttest 0112: Stationen: %', v_j; end if;
  raise notice 'Selbsttest 0112: ok';
end
$test$;

notify pgrst, 'reload schema';
