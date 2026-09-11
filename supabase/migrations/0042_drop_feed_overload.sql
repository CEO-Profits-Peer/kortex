-- =============================================================================
-- 0042_drop_feed_overload.sql  ·  Eine Funktion, nicht zwei
--
-- In 0039 habe ich die alte Signatur get_feed(int) stehen lassen, damit ein
-- noch nicht aktualisierter App-Stand nicht abstuerzt. Gut gemeint,
-- kaputt gedacht:
--
--     PGRST203  Could not choose the best candidate function
--
-- PostgREST waehlt anhand der uebergebenen Parameternamen aus. Ein Aufruf
-- mit nur p_batch_size passt auf BEIDE Varianten - der zweite Parameter
-- hat ja einen Standardwert. Damit war nicht der alte Aufruf abgesichert,
-- sondern unmoeglich gemacht: genau der Fall, den die Huelle schuetzen
-- sollte, war der einzige, der jetzt scheiterte.
--
-- Also weg damit. Es gibt eine Fassung, sie nimmt beide Parameter, und
-- p_exclude hat einen Standardwert - das reicht voellig.
-- =============================================================================

drop function if exists public.get_feed(int);
