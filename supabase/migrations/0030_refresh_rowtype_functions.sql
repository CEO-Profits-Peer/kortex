-- =============================================================================
-- 0030_refresh_rowtype_functions.sql  ·  Funktionen an die neue Tabellenform
--                                        anpassen
--
-- Der Fehler
-- ----------
--     42804  structure of query does not match function result type
--            Number of returned columns (35) does not match expected (32)
--
-- Sichtbar wurde er beim Tippen auf "Feed starten" in einer Kategorie: es
-- passierte scheinbar nichts, in Wahrheit stand dort "Feed konnte nicht
-- geladen werden".
--
-- Die Ursache
-- -----------
-- Mehrere Funktionen geben `setof public.content_items` zurueck. Die Form
-- dieses Zeilentyps wird beim Anlegen der Funktion festgehalten. Bekommt
-- die Tabelle danach Spalten, passt die Funktion nicht mehr zu ihrer
-- eigenen Rueckgabe - und faellt aus, sobald sie aufgerufen wird.
--
-- Dazugekommen sind:
--     0018  like_count
--     0027  kinetic_script
--
-- Wen es trifft:
--     get_category_feed  (zuletzt 0015)  -> war kaputt
--     get_course_feed    (0014)          -> war kaputt
--     get_person_feed    (0026)          -> war kaputt
--     get_feed           (0029)          -> in Ordnung, nach 0027 neu angelegt
--
-- Genau deshalb ist es niemandem aufgefallen: der Haupt-Feed lief.
--
-- Die Behebung
-- ------------
-- Jede betroffene Funktion wird mit ihrer EIGENEN, unveraenderten
-- Definition neu angelegt. `pg_get_functiondef` liefert den Quelltext, wie
-- er in der Datenbank steht; das Neuanlegen loest den Zeilentyp frisch auf.
--
-- Der Umweg ueber pg_get_functiondef statt abgetippter Rumpfe ist Absicht:
-- so kann sich beim Reparieren nichts einschleichen, was vorher nicht da
-- war. Es ist dieselbe Funktion, nur neu eingelesen.
--
-- Und fuer die Zukunft: wer `content_items` eine Spalte gibt, muss diese
-- Migration sinngemaess wiederholen. Der Hinweis steht deshalb auch als
-- Kommentar an der Tabelle.
-- =============================================================================

do $do$
declare
  v_fn      record;
  v_def     text;
  v_fixed   int := 0;
begin
  for v_fn in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proretset                                   -- setof ...
       and p.prorettype = 'public.content_items'::regtype
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    execute v_def;
    v_fixed := v_fixed + 1;
    raise notice 'neu angelegt: %(%)', v_fn.proname, v_fn.args;
  end loop;

  raise notice '% Funktionen an die aktuelle Form von content_items angepasst', v_fixed;
end
$do$;


comment on table public.content_items is
  'Karten. ACHTUNG: Funktionen mit "returns setof content_items" halten die '
  'Spaltenform beim Anlegen fest. Wer hier eine Spalte ergaenzt, muss sie '
  'danach neu anlegen - siehe Migration 0030, die genau das generisch tut.';
