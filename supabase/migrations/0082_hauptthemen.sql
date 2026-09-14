-- =============================================================================
-- 0082_hauptthemen.sql  ·  Drei neue Hauptthemen
--
-- Gefragt war "Mehr Main Themen?". Vorgeschlagen und gewollt: wenige, dafuer
-- gut gefuellt - der Gemini-Vorrat (rund 150 Karten am Tag) teilt sich auf
-- alle Themen auf, jedes neue macht die bestehenden duenner.
--
--   Geschichte & Gesellschaft   Antike, Neuzeit, Demokratie, Gesellschaft
--   Kunst & Kultur              Musik, Film & Serien, Literatur, Kunst
--   Sprache & Kommunikation     Woerter, Reden, Medien & Fakes, Sprachen
--
-- Was schon da war
-- ----------------
-- Drei Unterthemen gab es bereits, versteckt unter "Weltgeschehen" - einem
-- NACHRICHTEN-Oberpunkt, obwohl sie selbst Wissen sind (0050):
--
--   world.history  #geschichte      6 Karten
--   world.culture  #kultur          4 Karten ("Kultur & Sprache")
--   world.media    #medien          3 Karten
--
-- Sie daneben stehen zu lassen, hiesse zweimal "Geschichte" in der Suche.
-- Sie umzuhaengen (nur parent_id aendern) geht nicht sauber: die Abwechslung
-- im Feed erkennt den Oberpunkt am Praefix der ID (arrange.ts), und
-- "world.history" unter "history" waere fuer sie weiter Weltgeschehen.
--
-- Also Umzug: alles, was auf die drei zeigt, bekommt die neue ID - Karten,
-- Interessen samt Level, XP-Buchungen, Wiederholungen, Kurse, Themenliste.
-- Die alten Zeilen bleiben inaktiv stehen (Fremdschluessel mit "restrict"),
-- mit umbenanntem Slug, damit die neuen Oberpunkte #geschichte und #kultur
-- heissen koennen.
--
-- Zuordnung, bewusst grob: world.history -> Neuzeit & Moderne (die
-- vorhandenen Themen sind Industrielle Revolution, Berliner Mauer, Kalter
-- Krieg), world.culture -> Sprachen der Welt, ausser dem UNESCO-Welterbe
-- (-> Kunst & Architektur), world.media -> Medien & Fakes. Wo eine Karte
-- auch anderswo hinpasst, holt pipeline/hashtags.py das als weiteren Hashtag
-- nach.
--
-- Farben: drei, die es noch nicht gibt - Sand, Koralle, Tuerkis.
-- =============================================================================


-- --- Alte Slugs frei machen ------------------------------------------------------
update public.categories
   set slug = slug || '-alt', is_active = false
 where id in ('world.history', 'world.culture', 'world.media')
   and slug not like '%-alt';


-- --- Oberpunkte ---------------------------------------------------------------------
insert into public.categories
  (id, slug, parent_id, display_name, emoji, accent_hex, kind, max_level, is_active, sort_order, name_i18n)
values
  ('history',  'geschichte', null, 'Geschichte & Gesellschaft', '🏛️', '#E3B889', 'knowledge', 10, true, 80,
   '{"de":"Geschichte & Gesellschaft","en":"History & Society"}'::jsonb),
  ('culture',  'kultur',     null, 'Kunst & Kultur',            '🎨', '#FF7A6B', 'knowledge', 10, true, 90,
   '{"de":"Kunst & Kultur","en":"Arts & Culture"}'::jsonb),
  ('language', 'sprache',    null, 'Sprache & Kommunikation',   '💬', '#5AD1C4', 'knowledge', 10, true, 100,
   '{"de":"Sprache & Kommunikation","en":"Language & Communication"}'::jsonb)
on conflict (id) do nothing;


-- --- Unterthemen (erben die Farbe, wie in 0050) ------------------------------------------
insert into public.categories
  (id, slug, parent_id, display_name, emoji, accent_hex, kind, max_level, is_active, sort_order, name_i18n)
values
  ('history.early',      'antike',          'history',  'Antike & Mittelalter',   '🏺', '#E3B889', 'knowledge', 10, true, 81,
   '{"de":"Antike & Mittelalter","en":"Ancient & Medieval"}'::jsonb),
  ('history.modern',     'neuzeit',         'history',  'Neuzeit & Moderne',      '📜', '#E3B889', 'knowledge', 10, true, 82,
   '{"de":"Neuzeit & Moderne","en":"Modern History"}'::jsonb),
  ('history.democracy',  'demokratie',      'history',  'Demokratie & Staat',     '🗳️', '#E3B889', 'knowledge', 10, true, 83,
   '{"de":"Demokratie & Staat","en":"Democracy & State"}'::jsonb),
  ('history.society',    'gesellschaft',    'history',  'Gesellschaft',           '👥', '#E3B889', 'knowledge', 10, true, 84,
   '{"de":"Gesellschaft","en":"Society"}'::jsonb),

  ('culture.music',      'musik',           'culture',  'Musik',                  '🎵', '#FF7A6B', 'knowledge', 10, true, 91,
   '{"de":"Musik","en":"Music"}'::jsonb),
  ('culture.film',       'film',            'culture',  'Film & Serien',          '🎬', '#FF7A6B', 'knowledge', 10, true, 92,
   '{"de":"Film & Serien","en":"Film & TV"}'::jsonb),
  ('culture.literature', 'literatur',       'culture',  'Literatur',              '📖', '#FF7A6B', 'knowledge', 10, true, 93,
   '{"de":"Literatur","en":"Literature"}'::jsonb),
  ('culture.art',        'kunst',           'culture',  'Kunst & Architektur',    '🖼️', '#FF7A6B', 'knowledge', 10, true, 94,
   '{"de":"Kunst & Architektur","en":"Art & Architecture"}'::jsonb),

  ('language.words',     'woerter',         'language', 'Wörter & Herkunft',      '🔤', '#5AD1C4', 'knowledge', 10, true, 101,
   '{"de":"Wörter & Herkunft","en":"Words & Origins"}'::jsonb),
  ('language.rhetoric',  'rhetorik',        'language', 'Reden & Überzeugen',     '🎤', '#5AD1C4', 'knowledge', 10, true, 102,
   '{"de":"Reden & Überzeugen","en":"Speaking & Persuasion"}'::jsonb),
  ('language.media',     'medienkompetenz', 'language', 'Medien & Fakes',         '📰', '#5AD1C4', 'knowledge', 10, true, 103,
   '{"de":"Medien & Fakes","en":"Media Literacy"}'::jsonb),
  ('language.languages', 'sprachen',        'language', 'Sprachen der Welt',      '🌐', '#5AD1C4', 'knowledge', 10, true, 104,
   '{"de":"Sprachen der Welt","en":"World Languages"}'::jsonb)
on conflict (id) do nothing;


-- --- Umzug ------------------------------------------------------------------------------
-- Zuordnung als Tabelle, damit jede Stelle unten dieselbe benutzt.
-- Ohne "on commit drop": laeuft die Datei nicht als eine Transaktion, waere
-- die Tabelle nach dieser Zeile schon wieder weg. Geloescht wird sie unten.
create temporary table umzug (alt text primary key, neu text not null);
insert into umzug values
  ('world.history', 'history.modern'),
  ('world.culture', 'language.languages'),
  ('world.media',   'language.media');

-- Karten. Das Welterbe zuerst, sonst landet es mit dem Rest bei den Sprachen.
update public.content_items
   set primary_category_id = 'culture.art',
       category_ids = array_replace(category_ids, 'world.culture', 'culture.art')
 where primary_category_id = 'world.culture'
   and (title ilike '%welterbe%' or title ilike '%heritage%' or title ilike '%unesco%');

update public.content_items ci
   set primary_category_id = u.neu
  from umzug u
 where ci.primary_category_id = u.alt;

update public.content_items
   set category_ids = array_replace(array_replace(array_replace(category_ids,
         'world.history', 'history.modern'),
         'world.culture', 'language.languages'),
         'world.media',   'language.media')
 where category_ids && array['world.history', 'world.culture', 'world.media'];

-- Interessen und Level. Hat jemand (theoretisch) beide Zeilen, bleibt die neue.
update public.user_categories uc
   set category_id = u.neu
  from umzug u
 where uc.category_id = u.alt
   and not exists (select 1 from public.user_categories x
                    where x.user_id = uc.user_id and x.category_id = u.neu);
delete from public.user_categories where category_id in (select alt from umzug);

update public.xp_ledger l     set category_id = u.neu from umzug u where l.category_id = u.alt;
update public.review_queue r  set category_id = u.neu from umzug u where r.category_id = u.alt;
update public.courses c       set category_id = u.neu from umzug u where c.category_id = u.alt;
update public.sources s       set default_category_id = u.neu from umzug u where s.default_category_id = u.alt;

-- Themenliste der Pipeline (0073).
update public.topic_memory
   set category_id = 'culture.art'
 where category_id = 'world.culture'
   and (title ilike '%welterbe%' or title ilike '%heritage%');
update public.topic_memory t
   set category_id = u.neu
  from umzug u
 where t.category_id = u.alt;

drop table umzug;

notify pgrst, 'reload schema';
