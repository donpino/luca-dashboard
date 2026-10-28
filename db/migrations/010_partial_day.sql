-- 010_partial_day.sql
-- Marks rows written by the manual "Sync now" button for the day still in
-- progress (DASHBOARD_SPEC.md §6, v1.36). The next scheduled sync rewrites
-- that date as a complete day with is_partial = false, but if the schedule
-- ever stops, a half-day row must still be recognisable as one — never
-- mistaken for a finished day (the v1.4 reason the --to clamp exists).
--
-- NOT NULL with a default: every existing row was written by the clamped
-- scheduled path, so false is a true statement about all of them, not a
-- coerced unknown (CLAUDE.md rule 12). No CHECK needed — a NOT NULL boolean
-- has no NULL-pass gap to close.
--
-- Applied by hand via the Supabase SQL editor / MCP apply_migration, after
-- a verified successful backup.yml run.

alter table public.biometrics
  add column is_partial boolean not null default false;

alter table public.hr_daily
  add column is_partial boolean not null default false;
