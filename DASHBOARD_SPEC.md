# Training Dashboard — Build Spec v1.4

**Athlete:** Luca · **Campaign:** middle-distance, Foundation block → 2032
**Status:** Phase 0 in progress — `daily` table applied, `/log` route next · **Date:** 9 Aug 2026

This document is the contract. It goes in the repo root alongside `CLAUDE.md`.
Anything not defined here is an open question, not an implementation detail to
improvise. If the build needs a decision this file doesn't contain, stop and ask.

**Amendments in v1.1 (8 Aug 2026)** — all forced by Phase 0 implementation:
`archive/` and `backups/` move out of the repo to private Supabase Storage
(§4, §11.6); the render layer is a two-entry static build with no client router
(§4); null-vs-zero for `shin` is defined and made binding on the compute and
render layers (§5, §7, §10); the `/log` form layout is settled and locked (§8.5).

**Amendments in v1.2 (9 Aug 2026)** — forced by the FR70 arriving and being
worn from the night of 7–8 Aug: the fixture-based Phase 1 / Phase 3 split no
longer applies, since there is no fixture stage left to build against —
ingest is built directly against the real `python-garminconnect` API from the
start (§12). `activities.session_id` is added without a foreign-key
constraint, since `sessions` does not exist until the Phase 2 migration
(§5, §12). Following an exploratory pull against the real FR70 API: `biometrics.respiration_avg`
is renamed to `respiration_overnight` and bound to the sleep-endpoint
value, not the waking one (§5); `biometrics`/`activities` field mappings are
recorded against confirmed `python-garminconnect` response shapes, including
the unit conversions ingest performs and that `avg_pace_s_per_km` is derived
(§5); Garmin's own sleep score, Training Effect, VO2max and
`activityTrainingLoad` are explicitly excluded, same class as Training
Readiness/Status (§1, §5); wrist running power is corrected to say it is
retained in the raw archive only, not stored in `activities` — §7 previously
said "stored" with no corresponding column in §5 (§7).

**Amendments in v1.3 (9 Aug 2026)** — forced by two ingest pipelines about
to write the same `activities` table with different type vocabularies:
`source` is added to `activities`, not null, no default, CHECK-constrained
to `'garmin' | 'strava'` (§5); `type` gets a CHECK constraint restricting
it to `'running' | 'cycling' | 'other'`, with both ingest paths normalising
to it at write time and an unmapped value treated as a hard ingest error,
never passed through and never defaulted to `'other'` (§5); the
Strava/Garmin date boundary (through 7 Aug / from 8 Aug) is recorded as
binding, enforced in code rather than the schema, because the two sources
would otherwise double-write 8 Aug under two different activity ids (§6);
and v1.2's `biometrics.device` mapping note is corrected — the sentence
claiming the Strava import writes the `'amazfit'` value is deleted, since
the Strava import writes `activities` only and carries no RHR/HRV/sleep
data, so `biometrics` has no pre-FR70 source at all and the series begins
8 Aug 2026 (§5). Migration: `db/migrations/003_activity_source.sql`.

**Amendments in v1.4 (9 Aug 2026)** — forced by writing and running
`ingest/sync.py`, the first real backfill (8 Aug 2026 only): `ingest/sync.py`
is recorded as the single sync entrypoint for both the manual backfill and
the future scheduled job — there is no separate backfill script. It takes
`--from`/`--to` (inclusive ISO dates), defaulting to a trailing 3-day window
ending yesterday when both are omitted, and applies two clamps, each logged
when it fires: `--to` is never today or later — today's steps/stress/body
battery are mid-day values, so a row written now would stay permanently
half-recorded, and a `--to` of today or later clamps to yesterday instead;
`--from` is never earlier than the 8 Aug 2026 Garmin source boundary already
binding in §6 — an earlier `--from` clamps up to it rather than writing
pre-boundary rows (§6). A non-wear rule is added to the biometrics write
path: a row is written only if at least one of `sleep_total_min` / `rhr` /
`hrv_overnight` came back non-null; Garmin returns structural zeros
(`totalSteps: 0`, etc.) for a day the watch wasn't worn, and a zero-filled
row would be indistinguishable from a real quiet day in every downstream
panel — worse than no row, since rule 12's null-vs-zero discipline exists
precisely to keep an unanswered day from reading as a measured one. An
all-null day is skipped entirely, not written and not logged as an error
(§5, §6). `activities.raw_archive_path` is written `NULL` on every row from
this commit — archiving to the private Storage `archive/` bucket (§4,
§11.6) is deferred to a later commit, and this is recorded as a deferred
implementation gap, not a decision to leave the column permanently unused
(§5; the bucket does not exist yet — confirmed empty on the live project
during this commit). Ingest authenticates to Supabase with the
`service_role` key, not the `authenticated`-role RLS path `/log` uses,
because it is a headless batch job with no interactive Supabase Auth
session to hold the owner's `auth.uid()`; `service_role` bypasses RLS
entirely, so **RLS is not the safety boundary on the ingest write path** —
the binding constraints there are the date-window clamps above, the source
boundary, and the upsert-only rule (§6), same as CLAUDE.md rule 4. The key
lives only in `ingest/.env` (gitignored) locally and moves to GitHub Actions
secrets when the sync workflow ships (§4, CLAUDE.md rule 8) — it exists
nowhere else, and never in `web/` or any client bundle. Migration:
`db/migrations/004_service_role_grants.sql`, discovered necessary when the
first live run failed with "permission denied for table biometrics":
`bypassrls` only skips the RLS policy check, it does not substitute for a
SQL `GRANT`, and `002_biometrics_activities.sql` granted table privileges to
`authenticated` only — `service_role` didn't exist as a writer when that
migration was written. This is CLAUDE.md rule 10's two-gate model
(grants and RLS are independent) applying to a second role. Q1 check
(9 Aug 2026): `biometrics.device`'s type name was verified directly against
`002_biometrics_activities.sql` — it is the named Postgres enum
`public.device_type`, matching what v1.3's correction paragraph above
already called it. No correction needed.

---

## 1. What this is

A private-by-design, publicly-hosted training dashboard that answers four
questions and refuses to answer a fifth:

1. Is the shin loading up?
2. Are the easy runs actually easy?
3. Is the volume ramp inside tolerance?
4. Is the medio being raced?

The fifth — *"am I recovered today?"* as a single number — is deliberately
not answered. See §3.

**v1 scope:** running only. No gym analytics (strength completion is a binary
column, nothing more). No Campaign page. No correlation analysis.

**Out of scope until stated:** race predictions, VO2max modelling, anything
that consumes Garmin's own Training Readiness or Training Status scores as an
input to our own metrics.

---

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Store = **Supabase** (Postgres, free tier) | Airtable free caps at 1,000 rows/base; ~790 rows/yr means a ceiling in ~15 months, then ≈€240/yr. Supabase 500 MB is never reached. |
| 2 | Daily-entry write path = **`/log` route, Supabase Auth + RLS, password** | Public site stays read-only. Only Luca's account can write. |
| 3 | Host = **GitHub Pages, public** | Free. Safe only because of decision 4. |
| 4 | **No GPS coordinates ever leave the compute layer** | Public site + home-start runs = published absence schedule. No panel needs location. |
| 5 | **No surname anywhere on the site** | Health data, permanent, indexed, two years from a job market. |
| 6 | Charts = **ECharts**, interactive on all breakpoints | Native `dataZoom` for the range selector; tap-to-inspect is first-class. One codebase, no static mobile fork. |
| 7 | **No composite score** of any kind | §3. |
| 8 | Language = **English** | Matches coach files. |
| 9 | Strava = **one-time bulk archive import only**, then dropped | Seeds Dec 2025–Aug 2026 history. Account data export, not the API — no subscription, no ToS question. |
| 10 | Garmin ingest = `python-garminconnect` | Unofficial but mature. ToS-grey; accepted knowingly. |
| 11 | **Device-switch date is a hard break** in every series | Amazfit → FR70. Different sensor, different algorithm. Nothing averages across it. |
| 12 | Migration timing: `daily` now, `sessions`/`weekly`/`benchmarks` at the **Meso 1 boundary (17 Aug)** | Never split a live mesocycle across two systems. |

---

## 3. Design principles

Three rules, each derived from evidence, each binding on every panel.

**3.1 — Every panel is task-level, never self-level.**
Kluger & DeNisi (1996, *Psychological Bulletin*, 607 effect sizes) found feedback
improved performance on average (d = .41) but that **over a third of feedback
interventions made performance worse**, with effectiveness falling as attention
moved toward the self and away from the task. Feedback aimed at the task
produced positive effects; personal feedback produced consistently negative ones.

A tile reading `READINESS 55 ▼-2` is self-level feedback with nothing to act on.
It is banned. Every panel must answer *what do I change* — not *how am I doing*.

**3.2 — Every metric renders against its reference band.**
Control theory: monitoring only drives behaviour when there is a standard to
detect discrepancy against. A line with no target band is decoration. Bands come
from `full_plan.md` Anchors and are re-read at every benchmark.

**3.3 — The dashboard's output is a check-in, not a verdict.**
Harkin et al. (2016, *Psychological Bulletin*, 138 studies, N ≈ 19,951) found
progress monitoring promoted goal attainment at d+ = 0.40, mediated by monitoring
frequency — and that effects were **larger when the information was physically
recorded and when outcomes were reported or made public**. The Week page
therefore terminates in a *Generate check-in* action that produces the text block
Luca pastes to the coach on Sunday. That is the mechanism, not a convenience.

**3.4 — Statistical honesty is enforced in code, not in a disclaimer.**
Any panel making a population-level claim refuses to render below its sample
threshold and displays `insufficient data — 14/60 days` instead. See §8.4.

---

## 4. Architecture

```
┌─ INGEST ─────────────── GitHub Actions, cron 06:00 CET ─┐
│  garmin_client.py    → sleep, RHR, HRV, Body Battery,   │
│                         activities + streams            │
│  strava_import.py    → ONE-TIME archive backfill        │
│  (dev: fixtures/garmin_*.json — identical shape)        │
└──────────────────────────┬──────────────────────────────┘
                           │  secrets: GitHub Actions only
┌─ STORE ───────────────── ▼ ─────────────────────────────┐
│  Supabase Postgres  — system of record                  │
│  Storage: archive/  — raw Garmin JSON per activity, gz   │
│  Storage: backups/  — nightly pg_dump (free tier has    │
│                       no backups; this is the fix)      │
│  Both buckets PRIVATE, never in the repo — §11.6        │
└──────────────────────────┬──────────────────────────────┘
┌─ COMPUTE ──────────────── ▼ ────────────────────────────┐
│  metrics.py  — §7 definitions, strips coordinates,      │
│                writes public/data/*.json                │
└──────────────────────────┬──────────────────────────────┘
┌─ RENDER ───────────────── ▼ ────────────────────────────┐
│  Vite + React + ECharts → GitHub Pages (public, RO)     │
│  /log/ route → Supabase Auth + RLS (write, private)     │
└─────────────────────────────────────────────────────────┘
```

**The frontend is dumb.** It reads pre-computed JSON. It holds no credentials,
performs no aggregation, and contains no metric definitions. Every number on
screen was computed in `metrics.py` and is therefore testable and versioned.

**Coordinate stripping is a hard gate in `metrics.py`**, not a rendering choice.
Latitude and longitude are dropped before any file is written to `public/`. A
unit test asserts no output JSON contains a key matching `/lat|lon|coord|polyline/`.

**Two build entries, no client router.** The render layer is a static
multi-page build: `web/index.html` (public dashboard) and `web/log/index.html`
(the write surface). `/log/` therefore resolves as a real path on GitHub Pages
with no `404.html` redirect trick, and — the actual reason — **the public
dashboard bundle contains no auth code, no Supabase client, and no write
path.** The only credential in any bundle is the publishable key, which ships
only in the `/log/` entry. All fonts are self-hosted; the site makes no
third-party requests.

**Raw archives and backups never touch the repo.** They live in private
Supabase Storage buckets. `archive/` holds unstripped Garmin JSON — GPS
polylines and start locations included — and `backups/` holds `pg_dump` output
including the free-text `journal` column. Neither passes through the
coordinate-stripping gate, so neither may reach a public repo. See §11.6.

**`VITE_BASE_PATH`** is the deploy-time variable carrying the GitHub Pages
subpath (e.g. `/luca-dashboard/`), consumed by `vite.config.ts` as the build's
`base`. It defaults to `/` locally, so a developer never needs to set it to
run the site on a dev server.

---

## 5. Data model (Supabase)

### `daily` — manual entry, one row per day
| Column | Type | Notes |
|---|---|---|
| `date` | date, PK | |
| `shin` | int 0–3, **nullable, no default** | **First field on the form.** Gates everything. See the null rule below. |
| `creatine` | bool | prescribed daily, no cycling |
| `protein_breakfast` | bool | the named fuelling gap |
| `alcohol` | bool | **ticked = any alcohol consumed.** No ambiguity. |
| `late_meal` | bool | |
| `device_in_bed` | bool | ticked = phone in bed |
| `cold_room` | bool | |
| `breathing_exercises` | bool | |
| `stretching` | bool | recovery habit — **not** logged as a shin measure |
| `illness` | bool | only habit with an unambiguous effect in prior data |
| `study_hours` | numeric, nullable | captured now, rendered ~2027. Untouched submits `NULL`; `0` is a real value in term time. |
| `journal` | text | prompt: *"What most affected your recovery and sleep today?"* |

**The null rule for `shin` — binding on every layer.**
`shin` is nullable and has **no default**. `NULL` means *not answered*; `0`
means *assessed, no pain*. Collapsing the two would print a false all-clear on
the shin-vs-rolling-km panel, which is the primary periostitis warning on the
site — the one chart the dashboard exists for. Therefore:

- The `/log` form never pre-selects a value and refuses to submit without one,
  so `NULL` can only ever mean *a day that was never logged*.
- `metrics.py` never coerces, fills, interpolates, or zero-fills it.
- The render layer gives it a third marker state — see §7 `shin_series` and §10.

### `biometrics` — Garmin, one row per day
`date` PK · `sleep_total_min` · `sleep_deep_min` · `sleep_rem_min` ·
`sleep_light_min` · `sleep_awake_min` · `rhr` · `hrv_overnight` ·
`hrv_status` · `respiration_overnight` · `body_battery_min` ·
`body_battery_max` · `steps` · `stress_avg` · `device` (enum: `amazfit` | `fr70`)

`device` exists so the switch break is queryable, not hard-coded.

**Non-wear rule (v1.4).** A row is written only if at least one of
`sleep_total_min` / `rhr` / `hrv_overnight` came back non-null for that
date — see §6. A day where all three are null is skipped, not written as
a row of nulls and structural zeros.

**Field mapping, confirmed against a real FR70 pull (v1.2, 9 Aug 2026)** —
binding on the ingest layer, not an implementation detail to re-derive:

| Column | `python-garminconnect` source | Notes |
|---|---|---|
| `sleep_total_min`, `_deep_min`, `_rem_min`, `_light_min`, `_awake_min` | `get_sleep_data(date).dailySleepDTO.{sleepTimeSeconds,deepSleepSeconds,remSleepSeconds,lightSleepSeconds,awakeSleepSeconds}` | API returns **seconds** — ingest divides by 60 |
| `rhr` | `get_stats(date).restingHeartRate` | **No fallback.** `dailySleepDTO.restingHeartRate` also exists and is a different sample; if `stats` is null, write `NULL` — never substitute the sleep-endpoint value |
| `hrv_overnight` | `get_hrv_data(date).hrvSummary.lastNightAvg` | not `dailySleepDTO.avgOvernightHrv` — same-shaped field, different endpoint, not used |
| `hrv_status` | `get_hrv_data(date).hrvSummary.status` | stored **as returned**, including the literal string `"NONE"` — that is Garmin correctly reporting insufficient baseline history (spec's own ≥21-day gate), not a missing value. Never coerced to `NULL`. |
| `respiration_overnight` | `get_sleep_data(date).dailySleepDTO.averageRespirationValue` | not `get_stats(date).avgWakingRespirationValue` (waking respiration tracks daytime activity; overnight is measured under constant conditions and is the established early illness/overreaching marker) |
| `body_battery_min`, `body_battery_max` | `get_stats(date).bodyBatteryLowestValue` / `.bodyBatteryHighestValue` | single clean source, no ambiguity |
| `steps` | `get_stats(date).totalSteps` | |
| `stress_avg` | `get_stats(date).averageStressLevel` | |
| `device` | **not an API field on any of the above.** Hardcoded `'fr70'` in the Garmin ingest path. No ingest path writes `'amazfit'`; the `biometrics` series therefore begins 8 Aug 2026, with no pre-FR70 rows. |

**Correction (v1.3):** v1.2's mapping table said the `'amazfit'`
device value "is written only by the one-time Strava archive import" —
that was wrong, and the sentence has been removed from the table above.
The Strava import writes `activities` only; Strava's export carries no
RHR, HRV, or sleep data, so there is nothing for it to write into
`biometrics`. `biometrics` therefore has no pre-FR70 source at all, and
the series begins 8 Aug 2026. The `'amazfit'` value in `device`'s
`device_type` enum remains defined but currently has no writer. Importing the historical
Amazfit RHR/HRV/sleep from the athlete's own spreadsheet is a deferred,
separate manual path — not currently planned, and of limited value
regardless, since rule 5 / decision 11 forbid any baseline from spanning
the device break.

**Explicitly excluded from `biometrics`** — Garmin's own sleep score
(`sleepScores`, `sleepScoreInsight`, `sleepScoreFeedback`, `sleepNeed`) is a
model output, the same class as Training Readiness/Status excluded by §1.
Not stored. The raw archive (§4, §6) retains it, so this can be revisited
without re-pulling history.

### `activities` — one row per run
`id` PK · `date` · `type` · `source` · `distance_km` · `duration_s` ·
`avg_pace_s_per_km` · `avg_hr` · `max_hr` · `avg_cadence` ·
`avg_vertical_oscillation` · `avg_vertical_ratio` · `avg_ground_contact_ms` ·
`elevation_gain_m` · `session_id` FK → `sessions` · `raw_archive_path`

**`source`** — `'garmin'` | `'strava'`, not null, no default, enforced
by a CHECK constraint (`db/migrations/003_activity_source.sql`). No
default is deliberate: an ingest path that forgets to set it fails the
insert rather than writing a silently mislabelled row. See the source
boundary in §6.

**`type` vocabulary — binding, enforced by CHECK.** `type` is
restricted to `'running'` | `'cycling'` | `'other'`. Both ingest paths
normalise to this vocabulary at write time: Garmin's
`activityTypeDTO.typeKey` and Strava's export type string are each
mapped onto it. An unmapped value is a hard error at ingest — never
passed through unchanged, never defaulted to `'other'`. This is what
makes rule 6 (cycling excluded from `weekly_km`) actually enforceable:
the metric's type filter only works if `type` can't silently contain a
string the filter doesn't match.

**Strava-sourced rows carry structural NULLs, not missing
measurements.** Strava's export has no running-dynamics data:
`avg_cadence`, `avg_vertical_oscillation`, `avg_vertical_ratio`, and
`avg_ground_contact_ms` are NULL on every `source = 'strava'` row, and
`avg_hr` / `max_hr` may also be NULL. NULL here means the source never
carried the field, not that it went unmeasured. Any metric consuming
these columns must handle NULL rather than assume presence.

**No coordinates. No polyline. No start location.** Not stored, not fetched into
the output layer.

**`session_id` has no foreign-key constraint until Phase 2 (17 Aug).** The
column is created in the 002 migration so `activities` can be joined once
`sessions` lands, but `sessions` itself does not exist yet — referential
integrity is added in the same migration that creates it. See §12.

**Field mapping, confirmed against a real FR70 run (v1.2, 9 Aug 2026)** —
sourced from `get_activity(id).summaryDTO` (the aggregate summary), not
`get_activity_details`, which returns per-point time series and is not used
by any column below:

| Column | `python-garminconnect` source | Notes |
|---|---|---|
| `id` | `activityId` | Garmin's own numeric id — the upsert key, see below |
| `type` | `activityTypeDTO.typeKey` (e.g. `"running"`) | |
| `distance_km` | `summaryDTO.distance` | API returns **metres** — ingest divides by 1000 |
| `duration_s` | `summaryDTO.duration` | API returns **fractional seconds**; ingest rounds to the nearest int — sub-second precision is <0.04% pace error, immaterial to any band metric |
| `avg_pace_s_per_km` | **derived, not fetched** | `duration_s / distance_km`, computed at ingest time |
| `avg_hr`, `max_hr` | `summaryDTO.averageHR`, `.maxHR` | API returns float, always a whole bpm value |
| `avg_cadence` | `summaryDTO.averageRunCadence` | |
| `avg_vertical_oscillation` | `summaryDTO.verticalOscillation` | |
| `avg_vertical_ratio` | `summaryDTO.verticalRatio` | |
| `avg_ground_contact_ms` | `summaryDTO.groundContactTime` | |
| `elevation_gain_m` | `summaryDTO.elevationGain` | |
| `session_id`, `raw_archive_path` | not API fields | ingest-generated: joined by date, and the storage path written after archiving |

**`raw_archive_path` is `NULL` on every row as of v1.4** — archiving to the
private Storage `archive/` bucket (§4, §11.6) is deferred to a later
commit; the bucket does not exist yet (confirmed empty on the live project,
9 Aug 2026). This is a deferred implementation gap, not a decision to leave
the column permanently unused.

**Explicitly excluded from `activities`** — Training Effect
(`aerobicTrainingEffect`, `anaerobicTrainingEffect`, `trainingEffectLabel`),
VO2max (`vO2MaxValue`), and `activityTrainingLoad` are model outputs, same
class as Training Readiness/Status excluded by §1. Not stored; retained in
the raw archive. See §7 for wrist running power, excluded the same way.

### `sessions` — the plan (ported from Airtable, 17 Aug)
Existing shape retained: `date` · `week` · `phase` · `session_type` · `purpose` ·
`prescription` · `done` · `actual` · `rpe` · `shin` · `note`

`sessions.shin` and `daily.shin` overlap by design during the transition. After
17 Aug, `daily.shin` is authoritative and `sessions.shin` is dropped.

### `weekly` / `benchmarks`
Ported as-is. `weekly.dates` now Mon–Sun. `benchmarks` holds the corrected
1500 m (23 Sep) and 800 m (26 Sep) dates.

---

## 6. Ingest

**Superseded by v1.2 (§12 note):** the watch arrived before the ingest layer
was built, so there is no hand-written-fixture stage. `garmin_client.py` is
written directly against the real `python-garminconnect` API. Fixtures in
`ingest/fixtures/` are captured real API responses, saved so every layer
above ingest can be built and tested against a stable, real-shaped snapshot
without hitting the live API on every run — the fixtures now record actual
observed responses rather than a hand-authored guess at their shape.

Garmin auth: token stored in GitHub Actions secrets, refreshed by the job.
Sync is idempotent — re-running a day overwrites rather than duplicates. Given
what duplicate rows did to the Airtable base, this is enforced with a
`ON CONFLICT (date) DO UPDATE` upsert, never an insert. For `activities`
specifically the conflict target is `ON CONFLICT (id) DO UPDATE`, not
`date` — a day can hold more than one activity, so Garmin's own numeric
`activityId` is the natural key there, not the date.

**`ingest/sync.py` is the single entrypoint (v1.4)** — both the manual
backfill and the future scheduled job run through it; there is no separate
backfill script. `--from`/`--to` are inclusive ISO dates; omitting both
defaults to a trailing 3-day window ending yesterday. Two clamps apply,
both logged when they fire: a `--to` of today or later clamps to
yesterday, because today's steps/stress/body-battery are still mid-day
values and a row written now would stay permanently half-recorded; a
`--from` earlier than the 8 Aug 2026 source boundary below clamps up to
it, rather than writing pre-boundary rows. Ingest authenticates to
Supabase with the `service_role` key (bypasses RLS) rather than the
`authenticated`-role path `/log` uses, since it is a headless job with no
owner login session — RLS is therefore not the safety boundary on this
path, the clamps and the upsert-only rule above are (CLAUDE.md rule 8,
rule 4).

**Non-wear rule (v1.4).** A `biometrics` row is written for a date only if
at least one of `sleep_total_min` / `rhr` / `hrv_overnight` came back
non-null. Garmin returns structural zeros (`totalSteps: 0`, etc.) for a
day the watch wasn't worn, and a zero-filled row would be indistinguishable
from a real quiet day in every downstream panel — the same null-vs-zero
failure mode rule 12 exists to prevent, applied to an entire row rather
than a single field. A day where all three are null is skipped entirely:
no row, and not logged as an error.

**Source boundary — binding, enforced as a date filter in code, not in
the schema.** The Strava archive import writes `activities` rows dated
on or before 7 Aug 2026 only; the live Garmin path writes rows dated 8
Aug 2026 onward only. Both ranges are explicit date filters in each
ingest path. Reason: the run recorded on 8 Aug 2026 exists in both
sources under two different ids (Strava's and Garmin's own
`activityId`), so `ON CONFLICT (id) DO UPDATE` cannot deduplicate it —
the ids never collide. Only the date boundary prevents that day being
written twice under two rows.

---

## 7. Metric definitions

These are binding. The frontend must not recompute or reinterpret them.

| Metric | Definition |
|---|---|
| `weekly_km` | Σ `distance_km` for runs, Mon–Sun. **Cycling excluded** — impact load is the point. |
| `ramp_pct` | `(weekly_km − prev_weekly_km) / prev_weekly_km`. Reference band: ≤ 10%. |
| `rolling_7d_km`, `rolling_28d_km` | Trailing sums, running only. |
| `easy_band_compliance` | % of easy-run km with pace ∈ [5:15, 5:35]/km. Excludes first 10 min of each run (warm-up drift). |
| `medio_control` | Per medio: mean pace over the medio segment vs band [3:50, 4:00]. Sub-3:45 flags as *raced*, per `technique.md`. |
| `aerobic_efficiency` | Easy runs only: `speed_m_s / avg_hr`, computed on the steady segment (first 10 min excluded). Rising = engine growing. **This is the aerobic-progress marker named in `monthly_assessment.md`.** |
| `decoupling` | `aerobic_efficiency` second half ÷ first half, per run. Falling = fatigue or heat. |
| `rhr_baseline` | 30-day rolling median. Band = ±1 MAD. **Never spans the device break.** |
| `hrv_baseline` | 7-day mean vs 30-day mean, plus Garmin's own HRV Status when available. Requires ≥ 21 days on FR70 before rendering at all. |
| `impact_mechanics` | Per run: `avg_cadence`, `avg_vertical_oscillation`, `avg_vertical_ratio`, joined to `daily.shin` at date + 1 and date + 2. |
| `shin_series` | `daily.shin` joined to `rolling_7d_km` by date. **`NULL` is never coerced to `0`.** A missing day renders as a gap in the step series with a distinct unfilled marker on the date axis — not a value, not a zero. Every panel consuming shin declares its coverage as `n answered / n days in range`. |

**Explicitly not computed:** ACWR / load ratio (mathematical coupling between
numerator and denominator produces correlations that aren't there; also needs
months of history we don't have). Any readiness or recovery composite.
Wrist-based running power is **retained in the raw archive only — not
stored in `activities`** (§5 has no power column, and none is added). It is
a model output, not a measurement, same class as Training Effect and VO2max.
Also not computed: **any average, mean, or rolling mean of `shin`.** A 0–3
ordinal with gaps has no meaningful mean, and averaging is precisely what would
hide the single `2` that matters.

---

## 8. Pages and panels

### 8.1 Today — default landing on mobile
Read-only, fully automatic. Ten seconds, once, in the morning.

| Panel | Answers | Encoding |
|---|---|---|
| Last night | Sleep, RHR, HRV vs *his* band | Three values, each with its band drawn. No score. |
| Today's session | What to do | Pulled from `sessions`: purpose, prescription, target numbers, one cue |
| Flag | Anything needing a decision | **At most one.** If nothing qualifies, the slot is absent, not empty. |

The only thing Luca touches is the `/log` link.

### 8.2 Week — the coach surface
| Panel | Answers |
|---|---|
| Planned vs actual km | Did the week happen |
| Ramp % | Is the build inside tolerance |
| Session compliance grid | 7 cells, done / partial / missed |
| Easy-band compliance | Were easy days easy |
| Medio control | Was the quality session raced |
| Wellness summary | Sleep mean, RHR, HRV, shin max, outlier nights |
| **Generate check-in** | Produces the paste-ready block for Sunday |

### 8.3 Block — the mesocycle
| Panel | Answers |
|---|---|
| **Shin score over 7-day rolling km** | *The most important chart on the site.* Early warning for periostitis. Dual axis, shin as step series. |
| Volume ramp vs plan | Are we tracking the block |
| Aerobic efficiency trend | Is the engine growing |
| Impact mechanics vs shin | Does landing change before the shin complains |
| Strength adherence | Binary, per session |

### 8.4 Lab — locked by default
Correlation matrix, weekday effects, bedtime-vs-recovery scatter, habit impact.

Each panel declares `min_n` and **renders a locked state below it**:

```
insufficient data — 14/60 days
```

Thresholds: ≥ 60 days per variable, ≥ 20 observations at each level of a binary,
and the device break resets the count. No exceptions, no override, no "preview".

**Note on interpretation, written into the page itself:** these panels show
association only. Observational habit data cannot establish causation — the
prior Bevel logs produced *device in bed improves sleep* and *10,000 steps harms
recovery*, both artifacts of self-selection. Causal questions require n-of-1
alternating-block trials, which are a training decision, not a dashboard feature.

### 8.5 Log — the write surface  *(settled 8 Aug 2026)*

Not a dashboard page. Separate build entry (§4), authenticated, phone-first,
single column, no desktop layout. Sign-in is email + password only — no signup
UI, no magic link, no reset UI, because public signups are disabled.
Sign-in failures are shown inline with the real error text, never a generic
"something went wrong" — the same transparency rule already binding on save
failures below.

**Grouped, one screen, journal always visible.** The nine booleans are *not*
homogeneous — they mix polarity (creatine good, alcohol bad) and domain, and a
flat list of nine identical rows invites the scan-and-flip-everything error,
which silently poisons the only free variables the Lab page (§8.4) will ever
have. Group headers cost zero interactions and force a domain switch between
batches. The journal stays on screen because an optional field behind a second
tap gets filled for two weeks and then never again.

| Order | Block | Fields | Notes |
|---|---|---|---|
| 1 | Date header | `date` | Defaults to today, **except before 04:00 local, when it defaults to yesterday.** Future dates are rejected silently — native `max` on the date input plus a guard in code — not with an error message; there is nothing to explain to the athlete about a date the picker never should have offered. |
| 2 | **Status** | `shin` 0–3, `illness` | Four buttons, one row, ≥64 px, no default selection. Selected state readable without colour. Both fields gate interpretation of everything else — neither is a habit. |
| 3 | **Fuelling** | `creatine`, `protein_breakfast`, `alcohol`, `late_meal` | `alcohol` labelled "any amount". |
| 4 | **Sleep setup** | `device_in_bed`, `cold_room` | |
| 5 | **Recovery work** | `breathing_exercises`, `stretching` | `stretching` is a recovery habit, **not** a shin measure. |
| 6 | **Study** | `study_hours` | Stepper, ±0.5, no numeric keyboard. Untouched = `NULL`. The field can be cleared back to untouched at any time — a `Clear` control, same null-vs-zero stakes as `shin` (§5): `0` is a real value once touched, never a placeholder for unanswered, and one accidental tap must not be able to turn an unlogged day into a permanent `0`. |
| 7 | **Journal** | `journal` | Prompt is the label. One line high, grows on focus. Optional. |
| 8 | Sticky footer | Save | **Disabled until `shin` is answered.** The only required field. |

- **Writes are `upsert` on `date`, never `insert`** — same rule as ingest (§6),
  same reason (§6, duplicate rows). One row per day, always.
- On load, an existing row for that date prefills the form and Save reads
  "Update". Editing yesterday is a first-class action, not an edge case.
- Draft state is kept in `localStorage` keyed by date, restored only when no
  server row exists, cleared on successful save. A save failure never clears
  the form and never silently retries.
- `updated_at` is owned by the BEFORE UPDATE trigger; the client never sends it.

---

## 9. Interaction

- **Global range selector:** `7d · 30d · 90d · 6m · 1y · all`. Each range
  displays the **mean for that window and the delta vs the previous equivalent
  window**. This is the genuinely useful part of the reference design.
- **Charts stay clean.** No inline annotations, ever.
- **Tap/click a day or week** → a single shared detail drawer opens **above** the
  chart, showing that day's sessions, journal, habits, shin, and biometrics.
  One drawer component, reused everywhere.
- **Responsive:** identical panels, reflowed to one column below 768 px with
  fixed chart heights. Phone lands on Today; Week and Block assume tablet or
  desktop but must remain usable on phone.
- **Quality floor:** keyboard focus visible, `prefers-reduced-motion` respected,
  charts readable without colour.

---

## 10. Visual system

Dark and dense, per brief. Blue-black rather than neutral black — the palette is
anchored in Italian athletics *azzurro* rather than the default acid-on-black.

```css
--ink:      #0B0E13;  /* background */
--surface:  #141922;  /* panels */
--line:     #232B38;  /* hairlines, grid */
--text:     #E6EAF0;
--muted:    #8794A6;
--azzurro:  #3E8FD6;  /* primary data */
--amber:    #D4A017;  /* attention — used sparingly, never as a verdict */
```

**Type:** IBM Plex Sans for UI, IBM Plex Mono for all figures. Plex Mono has
true tabular figures, so columns of times and paces align — non-negotiable on a
dashboard that is mostly numbers — and the engineering lineage suits the athlete.

**Signature element — the lane.** Reference bands (§3.2) render as a *track lane*:
a filled channel with hairline edges, echoing lane markings. It is the one
decorative idea in the system, and it earns its place because it is also the most
functionally important element on every chart.

**Band vs point encoding — both, never on the same chart:**
- **Continuous trends** (RHR, HRV, aerobic efficiency) → shaded lane behind the line.
- **Discrete sessions** (each medio, each easy run) → **solid marker = in band,
  hollow marker = out of band.**

**A third marker state exists, for `shin` only: absent.** Solid = in band,
hollow = out of band, **absent = not answered** — hairline outline, no fill,
sitting on the axis. The primary periostitis panel (§8.3) must be readable as
three distinct states without colour. A day with no answer must never look like
a day with no pain.

**Red/green is not used for in/out.** Red is a judgement about the athlete;
"outside the band" is information about a session. Fill-vs-hollow carries the
same information, survives colour-blindness, and doesn't editorialise.

---

## 11. Privacy rules

1. No latitude, longitude, polyline, or start location — stripped in compute, asserted by test.
2. No maps. No route panels. Ever.
3. No surname, no club name, no photograph.
4. Public site is read-only. All writes go through authenticated `/log`.
5. Secrets exist only in GitHub Actions secrets. Never in the repo, never in the
   bundle. The one exception is the Supabase **publishable** key, which is public
   by design and ships only in the `/log/` entry; RLS plus table-level grants to
   `authenticated` only are the actual boundary.
6. **`archive/` and `backups/` are permanently gitignored and live in private
   Supabase Storage buckets.** The repo is public. `archive/` holds unstripped
   Garmin JSON (polylines, start locations); `backups/` holds `pg_dump` output
   including `journal`. Neither passes the §4 coordinate gate, so neither may
   ever be committed.

---

## 12. Roadmap

| Phase | Trigger | Deliverable |
|---|---|---|
| **0** | Now | Supabase project ✅, `daily` table + RLS + grants ✅, `/log` route ⏳. Logging starts the night `/log` ships. |
| **1** | Watch arrived (8 Aug) | Repo scaffold, Actions pipeline, `garmin_client.py` against the real API, `biometrics`/`activities` migration + RLS + grants, `metrics.py`, backfill, device-break marker, Week + Block off `sessions` data, Today goes live |
| **2** | 17 Aug — Meso 1 boundary | Port `sessions`/`weekly`/`benchmarks` from Airtable |
| **3** | +21 days on FR70 | HRV/RHR baselines established, bands become real, autoregulation panel on |
| **4** | Oct, post-benchmark | Campaign page — trajectory vs floor/target/stretch |
| **5** | 2027 | Lab unlocks, panel by panel, as each `min_n` is crossed |

Phase 3 completing before benchmark week (21–27 Sep) is the reason the watch
must be worn overnight from the day it arrives.

**v1.2 note:** phases 1 and 3 of v1.1 (fixture-based ingest, then swap for
the live API when the watch arrived) collapse into one phase here. The watch
arrived before the ingest layer was built, so there is no fixture stage to
build first — ingest is written directly against `python-garminconnect` from
the start. `ingest/fixtures/` still exists, but now holds *captured real
responses* used as test fixtures, not hand-written stand-ins.

---

## 13. Open questions

1. Does `sessions` stay the source of prescriptions, or does the plan move into
   a proper `plan` table with a generated-week pipeline? Current answer: keep
   `sessions`, revisit in October when the university timetable forces a rebuild.
2. Retention: raw Garmin JSON archived indefinitely, or pruned after N years?
   Current answer: keep — it is ~30 MB/year and re-analysis needs it.
3. Does the check-in generator output Markdown for pasting, or write directly to
   a `check_ins` table the coach reads? v1: Markdown.

**Resolved in v1.1 and moved out of this list:** null-vs-zero for `shin`
(§5, §7, §10); `/log` form layout (§8.5); archive/backup location (§4, §11.6).
