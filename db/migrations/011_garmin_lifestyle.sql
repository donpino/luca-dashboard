-- 011_garmin_lifestyle.sql
-- Garmin's lifestyle log feeds `daily` (DASHBOARD_SPEC.md §5, §6, v1.38).
-- Four Garmin behaviours map onto columns that already exist (alcohol,
-- late_meal, stretching, illness); the eight below are Garmin behaviours
-- the /log form didn't have. Same meaning as every other habit column:
-- NULL = not answered, false = answered no (CLAUDE.md rule 12) — so no
-- default and no NOT NULL.
--
-- service_role gains insert/update on daily: until now it only read it
-- (005), because only the athlete wrote it through /log. sync.py now
-- writes the lifestyle columns, never shin or journal.
--
-- No new table, so no new anon/authenticated grants are needed (rule 10
-- binds new tables); daily's existing grants and RLS cover new columns.
--
-- Applied by hand via the Supabase SQL editor / MCP apply_migration, after
-- a verified successful backup.yml run (29 Oct 2026, 08:59 UTC).

alter table public.daily
  add column melatonin          boolean,
  add column injured            boolean,
  add column cold_shower        boolean,
  add column nasal_strips       boolean,
  add column travelling         boolean,
  add column journaling         boolean,
  add column reading_in_bed     boolean,
  add column screens_before_bed boolean;

grant insert, update on table public.daily to service_role;
