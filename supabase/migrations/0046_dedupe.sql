-- =============================================================================
-- 0046_dedupe.sql  ·  Dieselbe Nachricht nicht zweimal
--
-- Der Befund
-- ----------
-- Aus einem einzigen Lauf, beide freigegeben, beide live:
--
--     "Start der Missionen FLEX und Sentinel-3C"
--     "Neuer Satellitenstart von FLEX und Sentinel-3C"
--
-- Derselbe Start, zwei Pressemitteilungen, zwei Karten. Wer scrollt,
-- sieht dieselbe Sache zweimal - und ein Feed, der sich wiederholt, wirkt
-- noch kuerzer als er ist.
--
-- Die Ursache ist unangenehm schlicht: `DEDUPE_SIMILARITY_THRESHOLD` wird
-- in config.py eingelesen, steht als Feld in der Konfiguration - und wird
-- an keiner einzigen Stelle benutzt. Die Einbettung jeder Karte wird
-- berechnet und gespeichert und danach nie wieder gelesen. Es gab also
-- eine Aehnlichkeitspruefung, die aussah wie eine, und keine war.
--
-- Gegen exakte Dubletten half bisher nur der content_hash. Der greift,
-- wenn zweimal derselbe Artikel kommt, und nie, wenn zwei Artikel
-- dasselbe Ereignis beschreiben - also genau im haeufigen Fall.
--
-- Diese Funktion
-- --------------
-- Gibt die aehnlichste vorhandene Karte zurueck, sofern sie ueber der
-- Schwelle liegt. Verglichen wird ueber den Kosinusabstand der
-- Einbettungen (`<=>` aus pgvector: 0 = gleich, 2 = entgegengesetzt),
-- Aehnlichkeit ist 1 minus Abstand.
--
-- Warum security definer: die Pipeline laeuft mit dem Service-Key und
-- braucht das nicht, aber so kann spaeter auch die App dieselbe Frage
-- stellen, ohne dass Einbettungen nach aussen wandern - zurueck kommt nur
-- Titel und Zahl, nie der Vektor.
-- =============================================================================

create or replace function public.find_similar_content(
  p_embedding    vector(768),
  p_min_similarity float default 0.86,
  -- Aeltere Karten sind kein Problem: wer eine Nachricht von vor einem
  -- halben Jahr nochmal bekommt, erlebt keine Wiederholung. Der Vergleich
  -- bleibt deshalb im aktuellen Zeitfenster und wird dadurch auch billig.
  p_within       interval default interval '30 days'
)
returns table (id uuid, title text, similarity float)
language sql stable security definer set search_path = ''
as $fn$
  -- operator(public.<=>) statt einfach <=>:
  --
  -- `set search_path = ''` ist hier Absicht (kein Unterschieben eigener
  -- Funktionen), hat aber eine Nebenwirkung, die man einmal erlebt haben
  -- muss: Typen werden ueber ihre OID aufgeloest und funktionieren
  -- weiter, OPERATOREN aber ueber den Suchpfad - und der ist leer. Ohne
  -- Qualifizierung kommt
  --
  --     operator does not exist: public.vector <=> public.vector
  --
  -- also eine Meldung, die aussagt, die pgvector-Erweiterung fehle,
  -- waehrend sie in Wahrheit da ist und nur nicht gefunden wird.
  select ci.id,
         ci.title,
         (1 - (ci.embedding operator(public.<=>) p_embedding))::float as similarity
    from public.content_items ci
   where ci.embedding is not null
     and ci.status in ('approved', 'pending')
     and ci.created_at > now() - p_within
     and (1 - (ci.embedding operator(public.<=>) p_embedding)) >= p_min_similarity
   order by ci.embedding operator(public.<=>) p_embedding
   limit 1;
$fn$;

grant execute on function public.find_similar_content(vector, float, interval) to service_role;


-- --- Suchhilfe --------------------------------------------------------------
--
-- Ohne Index vergleicht jede Anfrage alle Einbettungen. Bei den paar
-- hundert Karten von heute ist das egal; bei zehntausend nicht mehr, und
-- dann faellt es als langsamer Lauf auf, nicht als fehlender Index.
--
-- ivfflat statt hnsw: kleiner, schneller zu bauen, und fuer diese
-- Groessenordnung genau richtig. `vector_cosine_ops` muss zum `<=>` oben
-- passen - mit dem falschen Operator wird der Index stillschweigend
-- ignoriert.
create index if not exists content_items_embedding_idx
  on public.content_items using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
