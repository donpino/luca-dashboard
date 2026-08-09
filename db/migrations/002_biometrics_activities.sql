-- 002_biometrics_activities.sql
-- Creates the `biometrics` and `activities` tables (DASHBOARD_SPEC.md §5) —
-- Garmin-sourced, one row per day / one row per run. No other table is
-- created here; `sessions` lands in the Phase 2 migration (17 Aug).

-- device enum
-- Garmin FR70 replaced an Amazfit; different sensor, different algorithm.
-- CLAUDE.md rule 5 / spec decision #11: nothing averages across the switch,
-- and this column is what makes the break queryable rather than hard-coded.
create type public.device_type as enum ('amazfit', 'fr70');

-- shared updated_at trigger function
-- Same pattern as 001_daily.sql's set_daily_updated_at(): default now()
-- only fires on INSERT, and both these tables are upserted
-- (ON CONFLICT DO UPDATE, CLAUDE.md rule 4 / spec §6), so without this the
-- timestamp would go stale after the first sync. Shared across both tables
-- here since the logic is identical; search_path is pinned per CLAUDE.md
-- rule 11.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- ============================================================
-- biometrics — Garmin, one row per day
-- ============================================================

create table public.biometrics (
  date                   date primary key,
  sleep_total_min        integer,
  sleep_deep_min         integer,
  sleep_rem_min          integer,
  sleep_light_min        integer,
  sleep_awake_min        integer,
  rhr                    integer,
  hrv_overnight          integer,
  hrv_status             text,
  -- sleep.dailySleepDTO.averageRespirationValue, not stats' waking
  -- respiration value — overnight respiration is measured under constant
  -- conditions and is the established early illness/overreaching marker.
  -- Named to match hrv_overnight. See DASHBOARD_SPEC.md §6.
  respiration_overnight  numeric,
  body_battery_min       integer,
  body_battery_max       integer,
  steps                  integer,
  stress_avg             integer,
  -- Every row is Garmin-sourced from a known watch; unlike the sensor
  -- readings above, this is never unmeasured. Not null.
  device                 public.device_type not null,
  updated_at             timestamptz not null default now()
);

create trigger biometrics_set_updated_at
  before update on public.biometrics
  for each row
  execute function public.set_updated_at();

alter table public.biometrics enable row level security;

create policy "owner_full_access"
  on public.biometrics
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

-- Auto-exposure is disabled on this project (CLAUDE.md rule 10) — grants
-- and RLS are independent gates, both required. No grant to anon: the
-- public site reads only pre-computed JSON in web/public/data/, never the
-- database directly.
grant select, insert, update, delete on table public.biometrics to authenticated;

-- This project's default privileges grant anon REFERENCES/TRIGGER/TRUNCATE
-- on every new table regardless of "Automatically expose new tables" —
-- granting to authenticated does not remove them. Explicit revoke is
-- required, not implied by the absence of a grant. CLAUDE.md rule 10.
revoke all on table public.biometrics from anon;

-- ============================================================
-- activities — one row per run (or other logged session)
-- ============================================================

create table public.activities (
  -- Garmin's own numeric activityId, used as the natural key so a re-sync
  -- upserts the same row instead of duplicating it (CLAUDE.md rule 4) —
  -- unlike `daily`/`biometrics`, a day can hold more than one activity, so
  -- `date` cannot be the conflict target here.
  id                        bigint primary key,
  date                      date not null,
  type                      text not null,
  distance_km               numeric,
  duration_s                integer,
  avg_pace_s_per_km         numeric,
  avg_hr                    integer,
  max_hr                    integer,
  avg_cadence               numeric,
  avg_vertical_oscillation  numeric,
  avg_vertical_ratio        numeric,
  avg_ground_contact_ms     numeric,
  elevation_gain_m          numeric,
  -- No FK constraint yet: `sessions` does not exist until the Phase 2
  -- migration (17 Aug, DASHBOARD_SPEC.md §12). The column is created now so
  -- activities rows can be joined to it once that table lands; referential
  -- integrity is added in that same migration. See §5 note.
  session_id                uuid,
  -- Path into the private Supabase Storage `archive/` bucket (spec §4,
  -- §11.6) — the raw, unstripped Garmin JSON for this activity. Never a
  -- column that itself holds coordinates.
  raw_archive_path          text,
  updated_at                timestamptz not null default now()
);

-- No coordinates. No polyline. No start location. Not stored, not fetched
-- into this table — CLAUDE.md rule 1 / spec §4, §11.

create trigger activities_set_updated_at
  before update on public.activities
  for each row
  execute function public.set_updated_at();

alter table public.activities enable row level security;

create policy "owner_full_access"
  on public.activities
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

grant select, insert, update, delete on table public.activities to authenticated;

-- This project's default privileges grant anon REFERENCES/TRIGGER/TRUNCATE
-- on every new table regardless of "Automatically expose new tables" —
-- granting to authenticated does not remove them. Explicit revoke is
-- required, not implied by the absence of a grant. CLAUDE.md rule 10.
revoke all on table public.activities from anon;
