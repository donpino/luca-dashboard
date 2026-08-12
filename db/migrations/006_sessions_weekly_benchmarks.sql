-- 006_sessions_weekly_benchmarks.sql
-- Creates `sessions`, `weekly`, `benchmarks` (DASHBOARD_SPEC.md §5, §12 Phase 2 —
-- Meso 1 boundary, 17 Aug 2026), ported from the athlete's Airtable base.
-- Adds the `activities.session_id` FK deferred since migration 002.
--
-- `sessions` has no `shin` column — see the DASHBOARD_SPEC.md §5 amendment in
-- this same commit (CLAUDE.md rule 13). `daily.shin` (001_daily.sql) is the
-- sole source; Airtable's own `Shin (0-3)` column was empty on every row
-- inspected.
--
-- The coaching thread (a separate Claude project) writes these three tables
-- directly via the Supabase MCP execute_sql connector, which authenticates
-- as the `postgres` superuser (confirmed this session, 12 Aug 2026) — it
-- bypasses RLS and every table grant below entirely. That makes the CHECK
-- constraints on `phase`/`session_type`/`done` the ONLY database-level
-- protection against a bad write from that thread, not a backstop behind
-- PostgREST grants the way CHECKs function for every other table in this
-- schema.

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  date          date not null unique,
  week          text not null,
  phase         text not null,
  session_type  text not null,
  purpose       text,
  prescription  text,
  done          text not null,
  actual        text,
  rpe           numeric,
  note          text,
  updated_at    timestamptz not null default now()
);

-- phase/session_type/done are declared `not null` above, independently of
-- the CHECKs below — a bare `check (col in (...))` evaluates to NULL (which
-- Postgres treats as passing) when col IS NULL, so without the separate
-- NOT NULL a blank Airtable cell would import silently instead of failing.
alter table public.sessions
  add constraint sessions_phase_check
  check (phase in ('Build 1', 'Deload - Camp', 'Build 2 + Benchmark'));

alter table public.sessions
  add constraint sessions_session_type_check
  check (session_type in (
    'Easy Run', 'Medio', 'Long Run', 'Strength A', 'Strength B',
    'Hill Sprints', 'Strides', 'Flying-30 Test', 'Rest / Check-in',
    'Benchmark Test', 'Intervals', 'Cross-training'
  ));

alter table public.sessions
  add constraint sessions_done_check
  check (done in ('Pending', 'Yes', 'Partial', 'No'));

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row
  execute function public.set_updated_at();

alter table public.sessions enable row level security;

create policy "owner_full_access"
  on public.sessions
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

grant select, insert, update, delete on table public.sessions to authenticated;
revoke all on table public.sessions from anon;

-- ============================================================
-- weekly — Mon-Sun training weeks
-- ============================================================
-- week_start/week_end are real `date` columns, not the free-text Airtable
-- `Dates` field ("Aug 3-9") — that text is kept in dates_label for audit
-- only, never read by compute or the frontend. Both CHECKs below assert
-- the "Mon-Sun" claim in DASHBOARD_SPEC.md §5 rather than trusting it: the
-- import must fail, not guess, if a row doesn't parse to a clean week.

create table public.weekly (
  week_start       date primary key,
  week_end         date not null,
  week             text not null,
  dates_label      text not null,
  planned_km       numeric,
  actual_km        numeric,
  sessions_hit     text,
  sleep_avg_h      numeric,
  rhr_avg          numeric,
  hrv_avg          numeric,
  current_limiter  text,
  verdict          text,
  updated_at       timestamptz not null default now(),
  constraint weekly_mon_sun check (week_end = week_start + 6),
  constraint weekly_starts_monday check (extract(isodow from week_start) = 1)
);

create trigger weekly_set_updated_at
  before update on public.weekly
  for each row
  execute function public.set_updated_at();

alter table public.weekly enable row level security;

create policy "owner_full_access"
  on public.weekly
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

grant select, insert, update, delete on table public.weekly to authenticated;
revoke all on table public.weekly from anon;

-- ============================================================
-- benchmarks — test events (1500m, 800m, Flying-30, etc.)
-- ============================================================
-- test/result/vs_projection/notes are free text in the Airtable source (no
-- singleSelect involved there), so no CHECK vocab is invented for them.

create table public.benchmarks (
  id             uuid primary key default gen_random_uuid(),
  test           text not null,
  date           date not null,
  result         text,
  vs_projection  text,
  notes          text,
  updated_at     timestamptz not null default now(),
  constraint benchmarks_test_date_unique unique (test, date)
);

create trigger benchmarks_set_updated_at
  before update on public.benchmarks
  for each row
  execute function public.set_updated_at();

alter table public.benchmarks enable row level security;

create policy "owner_full_access"
  on public.benchmarks
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

grant select, insert, update, delete on table public.benchmarks to authenticated;
revoke all on table public.benchmarks from anon;

-- ============================================================
-- activities.session_id — FK deferred since migration 002
-- ============================================================
-- Joined by date, many-to-one: activities has no time-of-day/ordering
-- column beyond Garmin's opaque numeric id, so same-day activities cannot
-- be individually disambiguated and all link to that day's one sessions
-- row. A date with no matching sessions row leaves session_id NULL — the
-- column was already nullable for exactly this case. Population itself
-- (the one-time backfill UPDATE, and the ongoing lookup in
-- ingest/sync.py) is a separate, later step — this migration only adds
-- the referential-integrity constraint the column has been waiting for
-- since 002.

alter table public.activities
  add constraint activities_session_id_fkey
  foreign key (session_id) references public.sessions(id);

create index activities_session_id_idx on public.activities (session_id);
