-- =============================================================================
-- 0033_my_content_state.sql  ·  Likes und Reposts ueberleben das Neuladen
--
-- Was kaputt war
-- --------------
-- Die Karte merkte sich ihren eigenen Zustand in `useState(false)`. Das
-- heisst: geliked, weggescrollt, zurueckgescrollt - und das Herz ist wieder
-- leer. Nach einem Neuladen ohnehin.
--
-- Geschrieben wurde der Like durchaus: er landet ueber flush_events in
-- user_content_state.is_liked. Nur gelesen hat ihn nie jemand.
--
-- Warum das nicht einfach in get_feed mitkommt
-- --------------------------------------------
-- get_feed gibt `setof content_items` zurueck - eine Tabellenzeile, in die
-- nichts Nutzerbezogenes hineinpasst. Das umzubauen hiesse, den
-- Rueckgabetyp aller Feed-Funktionen zu aendern; wie empfindlich das ist,
-- hat 0031 gezeigt.
--
-- Stattdessen eine zweite, winzige Abfrage: die App holt fuer die gerade
-- geladenen Karten deren Zustand nach. Eine Anfrage pro Stapel, nicht pro
-- Karte.
-- =============================================================================

create or replace function public.get_my_content_state(p_ids uuid[])
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(
    jsonb_object_agg(
      x.content_id::text,
      jsonb_build_object('liked', x.liked, 'reposted', x.reposted)
    ),
    '{}'::jsonb
  )
  from (
    select ci.id as content_id,
           coalesce(ucs.is_liked, false) as liked,
           (r.content_id is not null)    as reposted
      from unnest(p_ids) as ci(id)
      left join public.user_content_state ucs
             on ucs.content_id = ci.id and ucs.user_id = auth.uid()
      left join public.reposts r
             on r.content_id = ci.id and r.user_id = auth.uid()
     where auth.uid() is not null
       -- Nur zurueckgeben, was ueberhaupt gesetzt ist. Ein Objekt mit
       -- hundert "false" ist groesser als die Karten selbst.
       and (coalesce(ucs.is_liked, false) or r.content_id is not null)
  ) x;
$fn$;

grant execute on function public.get_my_content_state(uuid[]) to authenticated;
