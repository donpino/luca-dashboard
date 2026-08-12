-- 007_service_role_read_sessions_weekly_benchmarks.sql
-- Grants service_role SELECT on sessions/weekly/benchmarks (DASHBOARD_SPEC.md
-- §13 open question 4) — compute/metrics.py may need to read
-- weekly.actual_km for pre-FR70 volume metrics once that open question is
-- resolved; same narrow, need-driven pattern as
-- 005_service_role_read_daily.sql. Not resolving open question 4 here —
-- only preparing read access for whichever commit resolves it.
--
-- service_role has no bearing on the coaching thread's own writes to these
-- tables: those go through the Supabase MCP execute_sql connector, which
-- authenticates as the postgres superuser (confirmed 12 Aug 2026), not
-- service_role. This grant serves compute/metrics.py alone, same as 005.
grant select on table public.sessions to service_role;
grant select on table public.weekly to service_role;
grant select on table public.benchmarks to service_role;
