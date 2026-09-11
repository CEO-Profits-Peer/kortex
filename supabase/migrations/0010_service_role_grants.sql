-- =============================================================================
-- 0010_service_role_grants.sql
--
-- Die Pipeline bekam "permission denied for table sources".
--
-- Ursache: Im Projekt ist "Automatically expose new tables" ausgeschaltet
-- (bewusst, siehe docs/SETUP.md). Damit laeuft der Event-Trigger nicht, der
-- neuen Tabellen sonst automatisch Rechte fuer anon, authenticated UND
-- service_role gibt. 0004_grants.sql hat nur an 'authenticated' vergeben.
--
-- Wichtig zu verstehen: service_role umgeht die ROW Level Security, aber
-- nicht die TABELLEN-Rechte. Das sind zwei getrennte Ebenen - RLS entscheidet
-- welche Zeilen, GRANT entscheidet ob ueberhaupt.
-- =============================================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions        in schema public to service_role;

-- Damit kuenftige Tabellen nicht wieder in dieselbe Falle laufen.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
