-- 003_activity_source.sql
-- Adds `source` to `activities` and a CHECK on `type` (DASHBOARD_SPEC.md
-- v1.3, §5) — two ingest pipelines are about to write this table and
-- nothing currently distinguishes them or constrains what `type` can
-- contain. Forward-only; alters `activities` columns only.

-- `source` distinguishes the live Garmin path (8 Aug 2026 onward) from the
-- one-time Strava archive import (through 7 Aug 2026) — see the source
-- boundary in DASHBOARD_SPEC.md §6. No default is deliberate: an ingest
-- path that forgets to set it must fail the insert, not write a silently
-- mislabelled row (CLAUDE.md rule 4's idempotency guarantee assumes every
-- row is attributable to exactly one pipeline). NOT NULL is declared at
-- add-column time below, with the CHECK added immediately after — so
-- `source` is never nullable with only the CHECK (which passes on NULL)
-- guarding it.
alter table public.activities
  add column source text not null;

alter table public.activities
  add constraint activities_source_check
  check (source in ('garmin', 'strava'));

-- `type` vocabulary is now enforced, not just documented (DASHBOARD_SPEC.md
-- §5, §7). CLAUDE.md rule 6 (cycling excluded from weekly_km) depends on
-- the type filter matching; without this constraint a mismatched string
-- like 'Run' or 'ride' from either ingest path would silently slip past
-- the filter instead of failing at write time. `type` was already declared
-- `not null` in 002_biometrics_activities.sql, so this CHECK alone is not
-- carrying the burden of excluding NULL — a bare `check (type in (...))`
-- would otherwise pass on NULL, since Postgres treats a NULL CHECK result
-- as satisfied, not failed.
alter table public.activities
  add constraint activities_type_check
  check (type in ('running', 'cycling', 'other'));
