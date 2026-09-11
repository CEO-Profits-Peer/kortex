-- =============================================================================
-- 0004_grants.sql  ·  Explizite Tabellen-Rechte
--
-- Noetig, weil im Projekt "Automatically expose new tables" AUS ist.
-- Das ist Absicht: neue Tabellen sind damit standardmaessig unsichtbar, und
-- jeder Zugriff muss hier bewusst freigeschaltet werden. Vergessene Grants
-- sind ein 404 - vergessene Revokes waeren ein Datenleck.
--
-- RLS (0002) entscheidet WELCHE ZEILEN. Grants entscheiden OB UEBERHAUPT.
-- Beides muss stimmen.
-- =============================================================================

grant usage on schema public to anon, authenticated;

-- --- Referenzdaten: nur lesen -------------------------------------------------
grant select on public.categories            to authenticated;
grant select on public.sources               to authenticated;
grant select on public.interaction_templates to authenticated;
grant select on public.achievements          to authenticated;
grant select on public.app_config            to authenticated;

-- --- Content: nur lesen -------------------------------------------------------
grant select on public.content_items  to authenticated;
grant select on public.courses        to authenticated;
grant select on public.course_lessons to authenticated;

-- --- Eigene Daten -------------------------------------------------------------
-- profiles / user_categories / user_content_state / xp_ledger / review_queue
-- sind bereits in 0002_rls.sql spaltengenau vergeben. Nicht wiederholen.

grant select on public.user_achievements to authenticated;
grant select, insert, update, delete on public.user_course_progress to authenticated;

-- Events sind die EINZIGE Tabelle, in die der Client direkt schreibt.
grant select, insert on public.content_events to authenticated;

grant select, insert, update on public.friendships to authenticated;
grant select on public.referrals to authenticated;

-- Sponsor-Kampagnen kommen ausschliesslich ueber get_feed(). Kein select-Grant.
grant insert on public.sponsor_impressions to authenticated;

-- --- anon (nicht eingeloggt): nichts ------------------------------------------
-- Kein einziger Grant. Wer nicht eingeloggt ist, sieht die Datenbank nicht.
-- Falls spaeter eine oeffentliche Landing-Preview gewuenscht ist, wird hier
-- genau eine View freigegeben - nie eine Tabelle.
