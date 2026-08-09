-- 004_service_role_grants.sql
-- Grants service_role the table privileges it needs to write biometrics
-- and activities (DASHBOARD_SPEC.md v1.4, §6) — discovered when running
-- ingest/sync.py for the first time: PostgREST rejected every write with
-- "permission denied for table biometrics" even though service_role has
-- Postgres's bypassrls attribute and RLS was never the blocker.
--
-- CLAUDE.md rule 10 already establishes that this project has table
-- auto-exposure disabled, so PostgREST enforces explicit table-level
-- grants independently of RLS — 002_biometrics_activities.sql granted
-- that privilege to `authenticated` (the /log route's role) but never to
-- `service_role` (ingest's role), because ingest didn't exist yet when
-- that migration was written. bypassrls only skips the RLS policy check;
-- it does not imply or substitute for a SQL GRANT. Same two-gate model as
-- rule 10, one more role.
grant select, insert, update, delete on table public.biometrics to service_role;
grant select, insert, update, delete on table public.activities to service_role;
