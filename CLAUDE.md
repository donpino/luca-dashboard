# CLAUDE.md — luca-dashboard

## What this repo is

A personal training dashboard for one middle-distance runner. It ingests Garmin
biometrics and running activities, computes a small set of carefully-defined
metrics, and renders them as a public read-only static site. It exists to answer
four questions: is the shin loading up, are the easy runs actually easy, is the
volume ramp inside tolerance, and is the medio being raced.

**`DASHBOARD_SPEC.md` in this directory is the contract.** Read it before writing
code. It defines the data model, every metric formula, every page and panel, the
visual system, and the phase order. It was written deliberately and argued over.

## The most important instruction

**If the build needs a decision the spec does not contain, stop and ask.**

Do not improvise a metric, invent a panel, add a field, or pick a threshold. The
design decisions in the spec have reasoning behind them that is not always
restated in the file, and a plausible-looking improvisation will silently
contradict something. Design happens in conversation with the athlete; this repo
implements what was decided.

## Hard rules — never violate these

1. **No coordinates in output.** Latitude, longitude, polyline, and start
   location are stripped in `compute/metrics.py` before anything is written to
   the web output directory. A unit test asserts no output JSON contains a key
   matching `/lat|lon|coord|polyline/`. The site is public and the runs start at
   the athlete's home.
2. **No composite scores.** No readiness score, no recovery score, no sleep
   score of our own, no single number summarising the athlete. This is not a
   style preference — see spec §3.1. If a panel design seems to need one, the
   panel design is wrong.
3. **Metric definitions live in `compute/metrics.py` only.** The frontend never
   aggregates, never derives, never recomputes. It reads pre-computed JSON and
   draws it. Every number on screen must be traceable to a tested function.
4. **Database writes are upserts, never inserts.** `ON CONFLICT (date) DO UPDATE`.
   A previous version of this system accumulated 35 duplicate rows and a
   one-day-offset ghost calendar. Sync must be idempotent.
5. **Never average across the device break.** The athlete switched from an
   Amazfit to a Garmin FR70; different sensor, different algorithm. The `device`
   column exists so this is queryable. Rolling baselines reset at the break.
6. **Cycling is excluded from `weekly_km`.** Impact load is the point of that
   metric. Bike sessions are stored but never counted toward running volume.
7. **Lab panels have no override.** Each declares `min_n` and renders a locked
   state below threshold. No preview mode, no "show anyway" flag, no query param.
8. **No secrets in the repo.** Garmin and Supabase credentials live only in
   GitHub Actions secrets. Never in code, never in a `.env` that gets committed,
   never in the client bundle.
9. **No surname, club name, or photograph** anywhere in the repo or the site.

## Stack

- **Ingest / compute:** Python 3.11+. `python-garminconnect` for Garmin.
  `supabase-py` for the database.
- **Store:** Supabase Postgres (free tier). Migrations as plain SQL in
  `db/migrations/`, numbered, forward-only.
- **Frontend:** Vite + React + **TypeScript** + ECharts. TypeScript is not
  optional here — the whole frontend is shape-matching against generated JSON,
  and that is exactly the bug class types catch.
- **Host:** GitHub Pages, deployed from Actions. The generated data JSON is a
  build artifact, not a committed file — do not commit `web/public/data/`.

## Layout

```
luca-dashboard/
├── CLAUDE.md
├── DASHBOARD_SPEC.md          ← the contract
├── .github/workflows/
│   ├── sync.yml               ← cron 06:00 CET: ingest → compute → deploy
│   └── backup.yml             ← nightly pg_dump into backups/
├── ingest/
│   ├── garmin_client.py
│   ├── strava_import.py       ← one-time archive backfill only
│   └── fixtures/              ← garmin_daily.json, garmin_activity.json
├── compute/
│   ├── metrics.py             ← every metric definition, spec §7
│   └── tests/
├── db/migrations/
├── web/
│   ├── src/
│   │   ├── pages/             ← Today, Week, Block, Lab
│   │   ├── panels/            ← one component per panel
│   │   └── components/        ← RangeSelector, DetailDrawer, Lane
│   └── public/
├── archive/                   ← raw Garmin JSON per activity, gzipped
└── backups/
```

## Build order

Follow spec §12. Do not skip ahead.

The watch has not arrived yet. **Everything above the ingest layer is built and
tested against `ingest/fixtures/`**, which are shaped exactly like the Garmin
library's return values. When the watch arrives, the only change is swapping the
fixture reader for the live client. If a task cannot be completed without real
Garmin data, say so rather than stubbing something that will need rewriting.

Current phase: **0** — Supabase project, `daily` table, `/log` route. The `/log`
route is the immediate priority because it is the only thing blocking daily data
entry.

## Conventions

- Import paths are **case-exact**. macOS is case-insensitive, Actions runs Linux.
  A wrong-case import works locally and fails in CI.
- Every metric in `compute/metrics.py` gets a test with a hand-checked expected
  value. No metric ships untested.
- Commit early and often; push to GitHub every session. The local drive is not
  the backup.
- Write commit messages that say what changed and why, not `update files`.

## Out of scope for v1

Gym analytics beyond a binary completion column. The Campaign page (returns
October). Correlation analysis of any kind. Race-time prediction. VO2max
modelling. Anything consuming Garmin's own Training Readiness or Training Status
as an input — those are model outputs, not measurements, and they will be wrong
for weeks on a new device anyway.
