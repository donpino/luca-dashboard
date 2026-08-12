-- 008_service_role_write_sessions_weekly_benchmarks.sql
-- Grants service_role INSERT/UPDATE on sessions/weekly/benchmarks —
-- discovered running ingest/airtable_port.py, the one-time Airtable port
-- (DASHBOARD_SPEC.md §5, v1.19 amendment): PostgREST rejected every write
-- with "permission denied for table sessions" even though service_role
-- has Postgres's bypassrls attribute. Same gap class as migration 004
-- (biometrics/activities) and the same fix — bypassrls only skips the RLS
-- policy check, it does not substitute for a SQL GRANT, and 007 granted
-- this role SELECT only because the only known need at the time was
-- compute/metrics.py reading weekly.actual_km.
--
-- No DELETE grant: nothing in this codebase deletes sessions/weekly/
-- benchmarks rows. The ongoing writer for these three tables stays the
-- coaching thread's postgres-superuser execute_sql connection (migration
-- 006's comment); this grant exists for headless one-time/backfill
-- scripts run under service_role, the same role ingest/sync.py already
-- uses to write biometrics/activities.
grant insert, update on table public.sessions to service_role;
grant insert, update on table public.weekly to service_role;
grant insert, update on table public.benchmarks to service_role;
