-- =============================================================================
-- 0087_wiederholen_ueberblick.sql  ·  Warum der Wiederholen-Knopf "nichts macht"
--
-- Gemeldet: "Im Profil: Knopf Wiederholungen macht nichts - entweder Nutzen
-- erklaeren oder loeschen".
--
-- Der Knopf tat etwas: er oeffnete die Wiederholung. Nur war dort meist
-- nichts faellig, und dann stand "Nichts faellig" mit einem Knopf "Zum Feed",
-- der in Wahrheit zurueck ins Profil ging. Von aussen: nichts passiert.
--
-- Loeschen waere falsch - Wiederholen ist das, was aus gelesenen Karten
-- Wissen macht, und die ergiebigste Mastery-Quelle der App. Also erklaeren,
-- und dazu gehoert eine Antwort auf "wann denn dann?". Die liefert diese
-- Funktion: faellig, eingeplant, wann die naechste kommt, wie viele sitzen.
-- =============================================================================

create or replace function public.my_review_overview()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'faellig',  count(*) filter (where not r.is_retired and r.due_at <= now()),
    'geplant',  count(*) filter (where not r.is_retired),
    'naechste', min(r.due_at) filter (where not r.is_retired and r.due_at > now()),
    -- Fuenfmal in Folge richtig: die Frage geht in Ruhestand (submit_review).
    'sitzt',    count(*) filter (where r.is_retired)
  )
  from public.review_queue r
  where r.user_id = auth.uid();
$fn$;
revoke execute on function public.my_review_overview() from anon;
grant  execute on function public.my_review_overview() to authenticated;

notify pgrst, 'reload schema';
