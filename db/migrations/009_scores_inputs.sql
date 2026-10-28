-- 009_scores_inputs.sql
-- Raw inputs for the three v1.35 scores — recovery, strain, sleep_score
-- (DASHBOARD_SPEC.md §5, §6, §7, v1.35 amendment). Ingest stores raw
-- samples only; every formula lives in compute/metrics.py (CLAUDE.md
-- rule 3).
--
-- Applied by hand via the Supabase SQL editor / MCP apply_migration, after
-- a verified successful backup.yml run — never in parallel with one.

-- ============================================================
-- biometrics — sleep window, for the sleep_score consistency term
-- ============================================================

-- dailySleepDTO.sleepStartTimestampLocal / sleepEndTimestampLocal. Local
-- wall-clock, not UTC: consistency is about the clock time the athlete
-- went to bed, which a DST change must not shift. Nullable — a night
-- Garmin didn't score has no window, and that stays NULL (CLAUDE.md
-- rule 12), never a default.
alter table public.biometrics
  add column sleep_start_local timestamp,
  add column sleep_end_local   timestamp;

-- ============================================================
-- activities — start time, to place each activity on the all-day HR
-- timeline for strain (§7)
-- ============================================================

-- summaryDTO.startTimeGMT. A time, not a location — CLAUDE.md rule 1 is
-- about coordinates and none are added. Nullable: Strava-sourced rows
-- predate this column and are never back-filled (strain starts at the
-- FR70 device break, rule 5).
alter table public.activities
  add column start_ts timestamptz;

-- ============================================================
-- hr_daily — Garmin all-day heart rate, one row per day
-- ============================================================

create table public.hr_daily (
  date        date primary key,
  -- get_heart_rates(date).heartRateValues with null readings dropped:
  -- [[epoch_ms_utc, bpm], ...], ~720 pairs/day at Garmin's 2-minute
  -- cadence. Stored raw; nothing is derived at ingest.
  samples     jsonb not null,
  device      public.device_type not null,
  updated_at  timestamptz not null default now()
);

create trigger hr_daily_set_updated_at
  before update on public.hr_daily
  for each row
  execute function public.set_updated_at();

alter table public.hr_daily enable row level security;

create policy "owner_full_access"
  on public.hr_daily
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

-- CLAUDE.md rule 10: explicit grant to authenticated AND explicit revoke
-- from anon, both required. service_role (ingest writes, compute reads)
-- needs its own grant — bypassrls is not a GRANT (migration 004).
grant select, insert, update, delete on table public.hr_daily to authenticated;
revoke all on table public.hr_daily from anon;
grant select, insert, update, delete on table public.hr_daily to service_role;

-- ============================================================
-- activity_hr — per-second HR stream for one activity
-- ============================================================

create table public.activity_hr (
  -- One stream per activity; re-sync upserts on this key (rule 4).
  activity_id  bigint primary key
               references public.activities (id) on delete cascade,
  -- get_activity_details(id).activityDetailMetrics, directTimestamp +
  -- directHeartRate only: [[epoch_ms_utc, bpm], ...]. Fetched with
  -- maxpoly=0, so Garmin returns no polyline at all — no coordinate ever
  -- reaches this table (rule 1).
  samples      jsonb not null,
  updated_at   timestamptz not null default now()
);

create trigger activity_hr_set_updated_at
  before update on public.activity_hr
  for each row
  execute function public.set_updated_at();

alter table public.activity_hr enable row level security;

create policy "owner_full_access"
  on public.activity_hr
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

grant select, insert, update, delete on table public.activity_hr to authenticated;
revoke all on table public.activity_hr from anon;
grant select, insert, update, delete on table public.activity_hr to service_role;
