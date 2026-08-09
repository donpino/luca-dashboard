-- 001_daily.sql
-- Creates the `daily` table (DASHBOARD_SPEC.md §5) — manual entry, one row
-- per day, owned by the athlete alone. No other table is created here.

create table public.daily (
  date                 date primary key,
  shin                 integer check (shin between 0 and 3),
  creatine             boolean,
  protein_breakfast    boolean,
  alcohol              boolean,
  late_meal            boolean,
  device_in_bed        boolean,
  cold_room            boolean,
  breathing_exercises  boolean,
  stretching           boolean,
  illness              boolean,
  study_hours          numeric,
  journal              text,
  -- Sync is an upsert (ON CONFLICT (date) DO UPDATE, CLAUDE.md rule 4 /
  -- spec §6); without this there is no way to tell when a row was last
  -- written. See DASHBOARD_SPEC.md §5.
  updated_at           timestamptz not null default now()
);

-- updated_at trigger
-- default now() only fires on INSERT. After an ON CONFLICT (date) DO UPDATE,
-- the column would keep the original insert timestamp forever — stale and
-- actively misleading. This trigger refreshes it on every UPDATE so
-- correctness doesn't depend on the sync job or /log route remembering to
-- set it themselves.
create function public.set_daily_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger daily_set_updated_at
  before update on public.daily
  for each row
  execute function public.set_daily_updated_at();

-- Row-level security
-- Single-owner table: only Luca's Supabase Auth account may read or write.
-- Hardcoded to his specific auth.uid() rather than a generic
-- "any authenticated user" check, per spec decision #2.
alter table public.daily enable row level security;

create policy "owner_full_access"
  on public.daily
  for all
  to authenticated
  using (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid)
  with check (auth.uid() = 'b026f73c-d178-4a67-ac15-a4435e3b554d'::uuid);

-- Grants
-- This project has "Automatically expose new tables" disabled, so no Data
-- API role has any privilege on this table until granted explicitly.
-- Grants and RLS are separate, independent gates — PostgREST checks table
-- privileges first and rejects the request before RLS is ever evaluated, so
-- both must be satisfied for the owner to read or write.
grant select, insert, update, delete on table public.daily to authenticated;

-- No grant to anon: the public site reads only pre-computed JSON in
-- web/public/data/, never the database directly, so the anon role needs
-- zero privileges on this table.
--
-- This project's default privileges grant anon REFERENCES/TRIGGER/TRUNCATE
-- on every new table regardless of "Automatically expose new tables" —
-- granting to authenticated does not remove them. Explicit revoke is
-- required, not implied by the absence of a grant. CLAUDE.md rule 10.
revoke all on table public.daily from anon;
