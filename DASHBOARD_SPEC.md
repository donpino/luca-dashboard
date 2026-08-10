# Training Dashboard — Build Spec v1.17

**Athlete:** Luca · **Campaign:** middle-distance, Foundation block → 2032
**Status:** Phase 1 complete — `daily` table, RLS/grants, `/log`,
`garmin_client.py`, `biometrics`/`activities` migrations, `sync.py`
backfill, the Strava archive import, `compute/metrics.py` done for every
metric computable against the current schema, and `.github/workflows/sync.yml`
(the scheduled ingest job) all shipped; four metrics
(`easy_band_compliance`, `medio_control`, `aerobic_efficiency`,
`decoupling`) are implemented as pure functions but have no real data to
run on yet — see the `laps` phase in §12. Pre-FR70 volume is now
known to be a floor, not a measurement — see the v1.7 amendment below
and §5, §7, §8.3. Frontend is deployed and gated — Cloudflare Workers
with static assets, live at the production `workers.dev` hostname,
behind a verified Cloudflare Access policy, Preview URLs disabled —
see the v1.11 and v1.12 amendments below.
`compute/build_data.py` writes the first real output artifact,
`web/public/data/shin_series.json` — v1.13. **The §8.3 shin panel is now
built and live on the index route** — ECharts, dual axis, the three
marker states, the v1.7 understated-volume hatch, and a minimum-data
caption below one rolling window — see the v1.16 amendment below.
**Deployment now runs in GitHub Actions**
(`.github/workflows/deploy.yml`: compute → build → deploy, gated on the
compute test suite) instead of Cloudflare's Git integration — see the
v1.14 amendment below. Four new Actions secrets are required and do not
exist yet; **disconnecting Cloudflare's Git integration is a pending
manual step**, not yet done. `deploy.yml`'s first real run passed every
step through `npm run build` and failed only at the Cloudflare deploy
step, on a Wrangler major-version mismatch — see the v1.15 amendment
below. **Two faults found on the §8.3 panel's first live view are fixed**
— the `rolling_7d_km` line had no legend entry, and the default range
was 2-3 days instead of a stated window — see the v1.17 amendment below.
· **Date:** 10 Aug 2026

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

**Amendments in v1.5 (9 Aug 2026)** — forced by writing and running
`ingest/strava_import.py`, the one-time archive backfill (spec decision
9, §6): the import script reads the athlete's Strava account data export
(`activities.csv` plus, unopened, an `activities/` folder of raw
`.fit.gz` files) from a directory passed as a **required CLI argument
with no default**, checked at runtime to reject any path inside the repo
— the export is GPS-bearing and the repo is public (CLAUDE.md rule 14).
The 7 Aug 2026 date boundary from §6 is enforced exactly as written: rows
dated 8 Aug 2026 or later are skipped and counted in the run summary,
never written — one row (the 8 Aug run, present in both sources under
different ids) was skipped on the first real run.

**Decision 9 is corrected, not just re-affirmed.** It previously read
"seeds Dec 2025–Aug 2026 history"; that estimate was written before
anyone had inspected the real export, which in fact runs **13 May 2023 →
7 Aug 2026**. The import applies no lower date bound — only the §6 upper
boundary — and pulls the full available range. Rationale, decided with
the athlete at import time: storage cost is negligible on the free tier,
and pre-Dec-2025 rows are real athletic history that cannot be
regenerated if discarded now. Decision 9 now reads "seeds the full
Strava export history (13 May 2023 → 7 Aug 2026), then dropped." Rows
before roughly October 2025 predate the athlete taking up track and are
football-era training — a different training context than anything else
in the dashboard, flagged here so it isn't mistaken for a data error
later.

**Strava `Activity Type` → canonical `type` mapping, as actually
implemented** (`ingest/strava_import.py TYPE_MAP`), confirmed against
the real export's seven distinct values:

| Strava `Activity Type` | Canonical `type` | Note |
|---|---|---|
| `Run` | `running` | |
| `Ride` | `cycling` | Outdoor and stationary/indoor rides are not distinguishable in this export and are not distinguished — both are cycling, both excluded from `weekly_km` (CLAUDE.md rule 6) regardless. |
| `Workout` | `other` | Decided with the athlete: this Strava bucket mixes real interval-running sessions (Italian names — `Ripetute`, `Velocità lunga`, `Ripetute sotto la pioggia` — track-repeat sessions) with unrelated sports (`Padel`, `Beach Volley`, `Go Kart`). Every one of the 77 rows in the real export has `distance = 0`, so the choice doesn't move `weekly_km`, but it is a known data gap, recorded below. |
| `Weight Training`, `Walk`, `Swim`, `Hike` | `other` | Not running, not cycling; unambiguous. |

Any Strava `Activity Type` outside this table is a hard ingest error
(`UnmappedActivityTypeError`) that aborts before any write — same rule
as the Garmin path's `TYPE_MAP` (§5, v1.3).

**Known data gap, recorded rather than silently accepted:** all 77
`Workout`-type rows in the real export carry `distance = 0`, including
the ones that are genuine track-interval running sessions Strava never
captured distance for. They import as `type = 'other'`, `distance_km =
0`. Any pre-8-Aug-2026 `weekly_km` or running-volume read therefore
**understates true running volume by an unknown amount** and must be
treated as a floor, not a measurement, by any panel or analysis that
reads that range.

**`avg_cadence` is written `NULL` on every Strava-sourced row, despite
the export in fact carrying an "Average Cadence" column** — v1.3's
"Strava-sourced rows carry structural NULLs" table (§5) assumed the field
was entirely absent; it isn't, but it's unsafe to use anyway. Strava's
column is per-leg strides/min; Garmin's `summaryDTO.averageRunCadence`
(§5's existing mapping) is full steps/min. The two were never confirmed
equivalent, and `impact_mechanics` (§7) joins `avg_cadence` across both
sources by date — importing an unverified-unit value would silently
corrupt that panel, which is worse than the gap it would fill. The
export's `Average Vertical Oscillation` / `Ground Contact Time` columns
genuinely do not exist (confirmed against the real header), so
`avg_vertical_oscillation`, `avg_vertical_ratio`, and
`avg_ground_contact_ms` remain true structural NULLs as v1.3 described.
`avg_hr`/`max_hr` are imported when the export row carries them, `NULL`
when blank — CLAUDE.md rule 12.

**Units, as actually applied.** The export's CSV header repeats some
column names — two columns called `Distance` (a rounded local-unit copy,
then a precise metres copy) and two called `Elapsed Time` (equal, one
int one float, both seconds) — `strava_import.py` reads by position
within the header for these, not by name alone, to avoid picking the
wrong one silently. `distance_km` = the precise-metres column ÷ 1000,
the same metres→km conversion the Garmin path applies (§5).
`avg_pace_s_per_km` is derived identically to the Garmin path:
`duration_s / distance_km`, `NULL` when `distance_km` is `0` or absent —
never a division error, never a fabricated pace.

**Id collision check, as actually implemented.** Before any write, every
Strava id in the import's scope is checked against existing
**`source = 'garmin'`** rows only, not against `source = 'strava'` rows.
Checking against all existing ids indiscriminately would make a second
run of the same import abort on its own previous output, which would
violate the "safe to run twice" requirement binding on every ingest path
(CLAUDE.md rule 4). Any collision with a `source = 'garmin'` id aborts
loudly before any write, naming the colliding id(s) — proving Garmin's
and Strava's id namespaces don't collide, exactly as CLAUDE.md rule 4's
upsert discipline assumes, rather than assuming it.

Live run result (9 Aug 2026): 491 rows imported (2023-05-13..2026-08-07,
216 running / 125 cycling / 151 other, less the 1 skipped 8 Aug row already
covered by the Garmin path), re-run confirmed idempotent, zero
coordinate-shaped keys found in the resulting schema.

**Amendments in v1.6 (9 Aug 2026)** — forced by writing and running
`compute/metrics.py`, the first real implementation of §7: four of the
nine metrics — `easy_band_compliance`, `medio_control`,
`aerobic_efficiency`, `decoupling` — turned out to need per-run,
sub-activity data (a warm-up-excluded steady segment, a first-half/
second-half split, "the medio segment") that no table stores.
`activities` holds only whole-run averages; there is no `laps` or
`streams` table. This is recorded as a deferred schema gap, not a design
decision to leave these four permanently unusable — see the new `laps`
phase in §12, and the corresponding row added to §7's table below. Each
of the four is implemented in `compute/metrics.py` as a pure function
against the binding definition, operating on caller-supplied per-lap
segment data (and, for the two that need it, a caller-supplied list of
already-classified easy/medio runs — that classification is a `sessions`
concern, out of scope until Phase 2, 17 Aug); today, with no ingest path
populating that input, all four return the explicit insufficient-data
signal against the real database, never a guess.

`rhr_baseline`'s table row (§7) previously stated "30-day rolling
median. Band = ±1 MAD," with no floor on how few points that window may
contain. Implementing it exposed the gap: at n=1 (the real count as of
9 Aug 2026, one day post-device-break), MAD=0, which collapses the band
to a single value and would render every subsequent real day as
out-of-band — a false alert on a health-adjacent metric, worse than
rendering nothing. `min_n = 14` days post-device-break is added to the
definition below; below it, the metric returns insufficient-data. This
is not the same class as `hrv_baseline`'s existing ≥21-day gate (that one
comes from Garmin's own HRV Status confidence window, per §5); this one
exists to keep a near-empty rolling window from masquerading as a
population statistic, same principle as §3.4 and §8.4's Lab thresholds.

Migration `db/migrations/005_service_role_read_daily.sql` grants
`service_role` `SELECT` (only — never write) on `daily`: `metrics.py`
runs headless, same as `sync.py` (§6, v1.4), and `shin_series` (§7)
requires reading `daily.shin`, which no prior migration granted to that
role. Same two-gate model as CLAUDE.md rule 10 and migration 004, one
more role, one more table.

`avg_cadence`'s Strava exclusion (§5, v1.5) is re-affirmed, not
reversed, but the reasoning was resting on an assumption never labelled
as such: that Strava's per-leg strides/min and Garmin's full steps/min
are related by a fixed, known factor (most likely ×2). That factor has
never been verified against real overlapping data. It could be verified
by comparing one run's Strava-exported cadence value against that same
run's cadence as shown natively in the Strava app (or against a Garmin
recording of comparable effort), and only then backfilled. Recovering
this historical cadence is separately noted as currently low-value
regardless of the conversion question: `impact_mechanics` (§7) joins
`avg_cadence` to `daily.shin`, and `daily` has no rows before 8 Aug
2026 (§8.5's `/log` route did not exist yet), so no pre-FR70 cadence
value has a shin row to join against today.

**Amendments in v1.8 (9 Aug 2026)** — forced by writing
`.github/workflows/sync.yml`, the scheduled ingest workflow (CLAUDE.md
build order; this section replaces §6's previously unimplementable
sentence "token stored in GitHub Actions secrets, refreshed by the job" —
a workflow cannot write back to its own secrets, so that could never have
worked as written).

**Schedule.** `cron: "0 5 * * *"` — 05:00 UTC daily, plus
`workflow_dispatch` for manual triggering. 05:00 UTC = 06:00 CET (winter,
UTC+1), matching §4's original "cron 06:00 CET" exactly; = 07:00 CEST
(summer, UTC+2), one hour later than the spec's literal wording. GitHub
Actions cron is UTC-only with no DST awareness, so a single fixed UTC
time necessarily drifts by an hour across the year — accepted because
`sync.py` never writes today and pulls a trailing 3-day window by
default (§6, v1.4), so a day missed by an hour of freshness is picked up
on the next run regardless. The workflow is **ingest-only**: it runs
`ingest/sync.py` and nothing else. It does not build or deploy the
frontend — no frontend exists yet (§12).

**Garmin token persistence — replaces §6's "refreshed by the job."** The
cached `garth` token directory (`~/.garminconnect_luca_dashboard`, the
same `TOKENSTORE` path `garmin_client.py` already uses locally, unchanged
by this amendment) is persisted across scheduled runs with `actions/cache`,
keyed `garmin-token-<run_id>-<attempt>` on save and restored via the
`garmin-token-` prefix as `restore-keys`. Login therefore normally
*resumes* a cached session rather than performing a fresh password login —
this is what makes a daily unattended run safe against Garmin's own
rate-limiting and new-device flagging, and is also why MFA does not block
scheduled runs in the normal case: `garth`'s cached-session resume does
not re-trigger Garmin's MFA challenge, only a *fresh* username/password
login does.

**Cache miss, explicitly.** On the first run ever, or after GitHub's
7-day unused-cache eviction, the restored directory is empty. The
workflow then seeds it from `GARMIN_TOKEN_SEED`, a one-time bootstrap
secret: a base64-encoded tar of a token directory produced by an
*interactive* local login (`python sync.py`, run on Luca's own machine),
so that if the Garmin account requires MFA, that challenge is answered on
a real terminal — never inside the workflow, which has no interactive
stdin to answer it with. **Whether this account has MFA enabled is not
yet confirmed** (open question, see §13) — the design above is
deliberately indifferent to the answer, since it never performs a fresh
login inside CI on the normal path either way. If `GARMIN_TOKEN_SEED` is
unset when a cache miss occurs, the workflow does not attempt a
password login itself; it lets `sync.py`'s own `get_client()` do that,
which now fails fast with an actionable message (`garmin_client.py`'s
`_prompt_mfa`, amended in this commit) instead of hanging or printing a
bare `EOFError` traceback, if MFA is then required.

**Recovery procedure, for when the cache is ever fully lost or a token
expires beyond `garth`'s refresh window:** run `python sync.py` locally
to log in interactively (answering MFA if prompted), then re-encode the
refreshed `~/.garminconnect_luca_dashboard` directory
(`tar -C ~/.garminconnect_luca_dashboard -cf - . | base64`) and replace
the `GARMIN_TOKEN_SEED` secret's value with the output, via Settings →
Secrets and variables → Actions.

**Never written anywhere readable in a public artifact.** The token
directory exists only inside GitHub's private Actions cache storage and
the encrypted `GARMIN_TOKEN_SEED` secret — never in a workflow log, never
committed, never in `web/` or any client bundle (CLAUDE.md rule 8). Cache
contents are not readable outside Actions runs by anyone without write
access to the repository.

**Public-log constraint — binding on the ingest path, not a one-time
audit.** The repo, and therefore its Actions logs, are public (CLAUDE.md
rule 8). Nothing `sync.py` or anything it calls prints may ever include a
Garmin email or password, a Garmin or Supabase token/key, a Supabase URL,
or coordinates. Activity distances, paces, HR, and row counts are fine —
those are published by design. `sync.py`'s existing `print()` calls were
audited against this rule while writing this amendment and already
comply — dates, boolean presence flags, `hrv_status`, activity ids,
types, and counts only, never a credential or secret value. This
constraint binds every future change to the ingest path's logging, not
just what exists today.

**Failure visibility.** GitHub Actions does **not** email failure
notifications by default — the relevant setting
(Settings → Notifications → System → Actions) defaults to "Don't
notify" and must be explicitly changed to "Email" or "Only notify for
failed workflows" for scheduled-run failures to reach an inbox at all.
Separately, and independent of that setting: GitHub sends scheduled-workflow
failure notifications to whichever user last modified the cron syntax in
the workflow file, not to every watcher of the repo. The workflow itself
exits non-zero on any ingest failure (`sync.py` raises rather than
catching and swallowing; `argparse`/`RuntimeError` failures propagate;
the "verify required secrets" step exits 1 on any missing secret) — no
path reports success on a failed sync.

**60-day inactivity auto-disable.** Confirmed applicable: GitHub
automatically disables scheduled workflows in a **public** repository
after 60 days with no repository activity. If it fires, the athlete would
observe the dashboard silently going stale — no error, no email (a
disabled schedule doesn't run at all, so there's nothing to fail loudly),
just data that stops updating one morning. Re-enabling requires a manual
click in the repo's Actions tab. Low risk given the athlete's own commit
cadence (spec amendments alone have landed same-day, repeatedly, through
Phase 0/1), but a real risk during an injury break or off-season gap long
enough to cross 60 days of repo silence.

**Python / dependencies.** Pinned to Python 3.14 (matching the local dev
`.venv`, confirmed `3.14.5`), installed from `ingest/requirements.txt` via
plain `pip install`, with `actions/setup-python`'s built-in `pip` cache
keyed on that file so the job isn't reinstalling from PyPI on every run.

Migration: none — this amendment adds no schema and no new table.

---

**Amendments in v1.7 (9 Aug 2026)** — forced by new information from the
athlete, and cross-checked against `Luca Training Tracker`, the
athlete's own Airtable base (`Weekly` and `Sessions` tables — spec §5's
`sessions`/`weekly`, ported to Supabase at Phase 2, 17 Aug).

**Pre-FR70 volume is a floor, not a measurement — binding, added to §7.**
Before the FR70 (8 Aug 2026), runs were tracked on a phone via Zepp,
which is unreliable and frequently cut runs short, especially at save
time. This is a device/tracking failure, not a `strava_import.py` bug —
confirmed against the athlete's own contemporaneous Sessions notes for
the week of 27 Jul – 2 Aug 2026: the Sunday long run (2026-08-02) reads
`distance_km = 6.9713` in the database; the athlete's Sessions note for
that date, written the same day, says *"Phone GPS + Zepp badly
under-tracked this run (showed 7km) —
true distance confirmed 11.04km via wristband backup... 64:45
elapsed."* The recorded `duration_s` (3861, ≈64:21) matches the true
64:45 elapsed almost exactly — the truncation cut the **distance**
tracking specifically, not the clock, which is why the row's implied
pace (554 s/km) reads as anomalously slow next to every other run that
week (all 340–360 s/km) rather than just short. The same week's Monday
medio shows a smaller instance of the identical failure — DB
`distance_km = 4.786` vs the athlete's same-day note *"Track GPS
undercounted distance (4.79km shown, true 5km per track laps)."* Every
other run that week (Tue, Wed, Thu) matches the athlete's own
reconciled figures closely (within ~1%) — this is not a uniform discount
applied to every row, it is an uneven, per-run failure mode, exactly as
the athlete described it, and it cannot be corrected by a formula.
**Every row with `source = 'strava'` therefore carries an unknown and
uneven undercount, and every volume metric computed over any range
ending before 2026-08-08 — `weekly_km`, `ramp_pct`, `rolling_7d_km`,
`rolling_28d_km` — is a floor on true volume, never a measurement of
it.** No metric formula changes; this is a data-quality fact about the
input, stated so it can't be read as more precise than it is.

**§8.3's shin-vs-rolling-km panel — binding rendering requirement, not a
note.** That panel is, in the site's own words, *"the most important
chart on the site"* — the periostitis early-warning chart the dashboard
exists for. Plotting understated pre-8-Aug mileage against real shin
scores understates the volume the shins were actually carrying when
they complained, which is backwards for an early-warning signal: it
would make the shins look more sensitive to volume than they are, not
less. Any portion of the shin-vs-rolling-km panel before 2026-08-08
**must** render with a distinct visual treatment marking it as
understated (e.g. a hatched or desaturated lane, distinct from the
normal reference-band fill — the specific treatment is a rendering-phase
decision, not fixed here) and **must not** be used, by that panel or by
any future feature, to infer a volume-tolerance threshold. This applies
to the panel only; it does not change `shin_series`'s own definition
(§7), which already renders `rolling_7d_km` numerically without judging
it against a band.

**`sessions`/`weekly` accuracy note, added to §5.** For the overlap
period (20 Jul 2026 onward, when the athlete's own Sessions/Weekly
logging began — no Airtable record exists before that date), the
athlete's own recorded weekly volume in `Weekly.Actual km` is more
accurate than the `activities`-derived `weekly_km` for the same range —
it is reconciled by the athlete against multiple sources (track laps,
wristband backups), not solely dependent on phone GPS. Confirmed for
the two weeks with real data: 20–26 Jul 2026 (`weekly_km` computed
30.17 km vs Airtable's recorded 30.2 km — negligible gap) and 27 Jul – 2
Aug 2026 (`weekly_km` computed 30.10 km vs Airtable's recorded 34.4 km —
the 4.3 km gap accounted for above). §13 adds an open question below on
what this means for which table pre-FR70 volume metrics should read
from once `sessions`/`weekly` ports at Phase 2.

**`strava_import.py`'s use of Elapsed Time, not Moving Time, is
confirmed and recorded as deliberate.** Spot-check: the 6 Jun 2026 run
reads `duration_s = 2482` (41:22) in the database against the Strava
app's displayed *moving* time of 41:16 — the two differ because they are
different fields, not because of a bug. `strava_import.py`'s
`read_rows()` resolves `elapsed_idx = col_index(header, "Elapsed Time",
0)` and never reads a "Moving Time" column at all — it is not in
`READ_COLUMNS`. This is deliberate, not an oversight: **Elapsed Time is
present and well-defined across the full 2023–2026 export; Moving Time
depends on each recording device's autopause behaviour, which is exactly
the kind of cross-device inconsistency the Zepp-era data already has
enough of.** Elapsed time is always ≥ moving time, so every derived
`avg_pace_s_per_km` on a `source = 'strava'` row is a conservative
(slower) pace estimate, never a flattering one — consistent with this
same amendment's volume-floor framing above: where pre-FR70 data is
wrong, it is wrong in the cautious direction, not the flattering one.
v1.5's existing text ("two columns called `Elapsed Time`... both
seconds") already describes the two same-named columns read for this
one field (int and float copies of the same elapsed-time value); it does
not refer to Moving Time, which is a separate, unread column.

---

**Amendments in v1.9 (9 Aug 2026)** — three previously locked decisions are
reversed, and one new binding rule is added, because the reasoning behind
each of the three no longer holds once two facts were actually checked
rather than assumed.

**Deployment check that forced this (not itself a decision).** `/log`
(§8.5, shipped in commit `bc1aca7`) has never been deployed anywhere.
`.github/workflows/` contains only `sync.yml`, which is ingest-only by its
own text ("no frontend exists yet," v1.8 amendment) — there is no
build/deploy workflow. `web/dist` is gitignored and has never been
committed. `origin` has no `gh-pages` branch; the only branch is `main`.
Everything above the ingest layer today runs only via the local Vite dev
server on Luca's machine. This means decision 3 below costs nothing to
reverse — there is no live public deployment being migrated away from,
only a hosting decision that was never acted on.

**1. Host change — supersedes §2 decision 3 and §4's architecture
diagram/prose.** Host becomes **Cloudflare Pages, with Cloudflare Access
(Zero Trust) in front**, providing server-side authentication at the edge.
GitHub Pages is dropped for two reasons: it offers no access control
outside GitHub Enterprise Cloud, a plan this project has no reason to buy
for one dashboard; and a client-side "password protection" scheme for a
static site is theatre here specifically, not in general — this
dashboard's numbers live in separate JSON files under
`web/public/data/*.json`, served as ordinary static assets alongside the
HTML. A gate implemented in the page's own JS runs *after* the browser has
already been permitted to fetch every static file in the deploy; the JSON
was always a directly-fetchable sibling of the HTML, reachable with a bare
`curl` regardless of what the page's JS does or doesn't render. Only a
gate that intercepts the HTTP request before Cloudflare's edge serves any
file — Access does exactly this — actually protects it.

Verified before adopting this, 9 Aug 2026, per this amendment's own
instruction to verify rather than assume: Cloudflare's Zero Trust Free
plan is $0/month, covers up to 50 users (one is enough), includes Access,
and supports email one-time-PIN login with no third-party identity
provider required — an email address is added directly to an Access
policy and group, no IdP configuration needed. Cloudflare's own
onboarding now defaults new Zero Trust accounts to Cloudflare's own SSO
rather than OTP, but OTP remains available to add at any time; nothing
about the free tier or its $0 price gates this. Sources:
developers.cloudflare.com's Zero Trust plans/pricing page and its
"One-time PIN login" identity-provider doc, cross-checked against current
third-party Zero Trust pricing trackers, checked live during this
amendment rather than recalled from training data.

The repo stays **public** — no data is committed; `web/public/data/`
remains gitignored (CLAUDE.md Layout note) and is generated fresh by every
deploy, exactly as today. What changes is the **site**: the deployed
Cloudflare Pages site sits behind Access, so the built HTML/JS/JSON is
reachable only after an authenticated session — where GitHub Pages could
only ever be all-public, or require an Enterprise Cloud plan this project
isn't on.

`VITE_BASE_PATH` (§4) was written to carry a GitHub Pages *project-site*
subpath (e.g. `/luca-dashboard/`). That premise no longer holds — a
Cloudflare Pages deploy (custom domain or `*.pages.dev`) serves from the
site root, not a repo-name subpath. The variable's mechanism (`base`
defaulting to `/` locally, so a developer never sets it to run the dev
server) is unaffected and needs no change; its purpose-built reason for
existing, stated in §4, does. Left as a loose end for the implementation
phase — the exact deploy-time value it should carry under Cloudflare
Pages, if any, is not decided here and isn't needed to record this
amendment.

**2. Single build entry — supersedes §4's "two build entries, no client
router."** *(Deferred to Phase 2 by the v1.10 amendment below — the two
static entries are retained for the first deploy; the reasoning here is
what makes that eventual merge safe, not a statement that it has
happened yet.)* The render layer becomes one app, one bundle, a
client-side router, with `/log` reachable from the dashboard's own
navigation, not a second static build entry at `web/log/index.html`.

The original split existed for one stated reason: to keep auth code, the
Supabase client, and any write path out of a bundle that was publicly
reachable by anyone on the internet — the public dashboard bundle was
built to carry nothing an anonymous visitor could use to attempt a write.
That reasoning was conditioned on the dashboard bundle being publicly
reachable, and decision 1 above removes that condition: with Cloudflare
Access gating the entire site at the edge, the only person who can reach
*any* bundle — dashboard or `/log` — is the authenticated athlete. There
is no anonymous visitor left to keep the write path away from.

**Accepted explicitly:** the Supabase publishable key now ships in the
single combined bundle, not only in a `/log`-only entry as §4 and §11
previously described. This is accepted because RLS and the table grants
to `authenticated` (CLAUDE.md rule 10) were always the actual write
boundary, never the bundle split — the publishable key is public-by-design
already (§11 rule 5); what changes is who can *reach* the key at all
(anyone, under the old GitHub Pages design, vs. only the authenticated
athlete, under Access), not what the key can *do*.

**3. RLS is still the boundary — new, binding, not previously stated
anywhere in this spec.** Cloudflare Access protects the *page*; it is not
a substitute for the *database* boundary. Supabase Auth and RLS are
unchanged by this amendment: `/log` still requires its own Supabase
sign-in (§8.5's email+password form, unchanged), and writes still depend
on RLS policies plus the `authenticated`-role grants from CLAUDE.md rule
10. An authenticated Cloudflare Access session proves only that a request
reached the edge with a valid Access JWT for the athlete's own email — it
carries no Supabase claims, and PostgREST never sees it. Cloudflare Access
must never be treated as replacing a Supabase RLS policy, a table grant,
or the `/log` sign-in step, on this or any future page. Two independent
gates, same two-gate principle as CLAUDE.md rule 10's grants/RLS pair
(and migrations 004/005's role-by-role application of it), one more layer
on top.

**4. Temporal semantics of `daily` — new, binding, previously undefined
anywhere in this spec.** Confirmed with the athlete: a `daily` row's
`date` is the calendar day the *behaviours* happened, not the day their
effects are measured. Garmin files a night's sleep under the **wake**
date, not the date the athlete went to bed — confirmed against the one
real `biometrics` row that exists as of this commit: the FR70 was first
worn the night of 7–8 Aug 2026, and the resulting sleep/RHR/HRV row is
dated **2026-08-08**, the wake date, not 2026-08-07.

**Verification against further nights, as instructed:** checked directly
against the live database while writing this amendment (9 Aug 2026) —
`biometrics` and `daily` each currently hold **exactly one row**, both
dated 8 Aug 2026. There is no second night yet to cross-check the wake-
date rule against. This rule is therefore recorded as binding on the
strength of that single confirmed night plus the athlete's direct
statement of how Garmin's own dating works, not on repeated confirmation
— it should be re-verified against the next several real nights as
`biometrics` accumulates rows, and this paragraph updated with the
result.

Therefore, binding on the Lab page (§8.4) and any future analysis joining
`daily` to `biometrics` — see §5 and §8.4 for the corresponding edits:
every habit field in `daily` (`creatine`, `protein_breakfast`, `alcohol`,
`late_meal`, `device_in_bed`, `cold_room`, `breathing_exercises`,
`stretching`, `study_hours`) and the `journal` text describe behaviour
that affects the *following* night's sleep. When any of these are joined
to `sleep_total_min` / `rhr` / `hrv_overnight` or any other sleep-derived
field in `biometrics`, **the join is at `daily.date + 1 = biometrics.date`,
never same-date.** A same-date join would pair Tuesday's alcohol flag
against Monday night's sleep — the night *before* the drink, not after
it.

`shin` and `illness` are the exception, unaffected by this rule: both are
same-day state, not forward-looking habits — consistent with §8.5 already
grouping them separately as *Status* (row 2) rather than under any habit
block (rows 3–6). They join at **date + 0**, exactly as `shin_series`
(§7) already does today.

This is not a new *kind* of rule for this spec — §7's `impact_mechanics`
already joins `avg_cadence` / `avg_vertical_oscillation` /
`avg_vertical_ratio` to `daily.shin` at date + 1 *and* date + 2.
Date-offset joins are an established pattern here; this amendment extends
the same pattern to the habit fields against `biometrics` and states it
as a general rule, rather than leaving each future Lab panel to
rediscover it independently.

**5. Journal prompt — amends §5 and §8.5.** The current prompt, *"What
most affected your recovery and sleep today?"*, is ambiguous about
whether "today" means the sleep just had (looking back, this morning) or
the sleep about to happen (looking ahead, tonight) — exactly the
ambiguity item 4 above resolves for every other field in `daily`, but the
prompt itself was never brought in line with it. Per item 4, the answer
is the night ahead. Replacement prompt, short enough to sit as the form
label per §8.5's existing pattern:

> **"What might affect tonight's sleep?"**

This removes the tense ambiguity directly — "tonight," not "today" — and
matches what the field actually captures: free text describing the
current day's behaviour, framed as a forward-looking recovery note,
joined at date + 1 exactly like the habit booleans beside it.

---

**Amendments in v1.10 (9 Aug 2026)** — the first Cloudflare Pages deploy
of the frontend, prepared in this commit. Two items; neither reverses a
v1.9 decision, both settle loose ends v1.9 left open.

**1. Two build entries retained — v1.9 decision 2 deferred, not
reversed.** v1.9 item 2 called for collapsing `index.html` and
`log/index.html` into a single bundle with a client router, and gave the
correct reason to eventually do so: with Cloudflare Access gating the
whole site, there is no anonymous visitor left to keep the write path
away from. That reasoning removed the *need* to keep the two entries
apart. It did not create a need to merge them, and merging them today
buys nothing — Week and Block don't exist yet, so there is no second
page for a router to route to, and `/log` is reachable today only by
typing its URL, exactly as the two-entry build already serves it. Two
static entries deploy correctly on Cloudflare Pages: `log/index.html`
serves at `/log/`, and Access protects the whole hostname regardless of
how many bundles sit behind it. The consolidation is deferred to
**Phase 2**, when Week and Block exist and a router has pages worth
routing between — see §12. §4's architecture diagram and prose, and
v1.9 item 2's own text, are updated below and above so a reader of
either does not conclude the merge already happened.

**2. `VITE_BASE_PATH` stays unset — closes the loose end v1.9 left
open.** v1.9 item 1 identified that this variable's original purpose
(carrying a GitHub Pages project-site subpath) no longer applied under
Cloudflare Pages, but left "what value, if any, it should carry" open
for the implementation phase. Answered now: none. Cloudflare Pages
serves from the site root — custom domain or `*.pages.dev` — so `base`
resolves to `/` whether the variable is set or not, and it is left
unset. §4 is updated below to close this loose end.

**Also shipped in this commit:** `web/.nvmrc` pins Node to `22`. The
repo declared no Node version anywhere; Cloudflare Pages reads `.nvmrc`
from the build root (`web/`), and without one it would default to
whatever LTS Cloudflare's build image currently ships, an unpinned and
silently-changeable choice. Local dev runs Node 25.9.0, an
odd-numbered non-LTS release that should not leak into the build image.

---

**Amendments in v1.11 (9 Aug 2026)** — the host changes again, before the
v1.10 Cloudflare Pages deploy ever went live: the first deploy attempt,
created through Cloudflare's dashboard, was routed into a Workers project
by Cloudflare's own current default rather than a Pages one, and failed
with `ENOENT` on `/opt/buildhome/repo/package.json` — a Pages-shaped build
root (`/`) applied to a project Cloudflare had silently placed on the
Workers path, whose deploy command (`npx wrangler deploy`) needs a
Wrangler config the repo never had. Investigating that failure is what
surfaced the two reasons below; this is not a cosmetic rename of the same
host.

**1. Host change — supersedes §2 decision 3 and §4's architecture
diagram/prose, again.** Host becomes **Cloudflare Workers with static
assets**, not Cloudflare Pages. Two reasons:

- Cloudflare is folding Pages into Workers — new platform features ship
  to Workers first, Pages increasingly not at all. Deploying to Pages
  now would mean building a migration this project would have to redo
  later, for no benefit gained by waiting.
- Protecting the default `*.workers.dev` subdomain with Cloudflare
  Access is a single toggle (Worker → Settings → Domains & Routes →
  `workers.dev` → Enable Cloudflare Access). The Pages equivalent
  (`*.pages.dev`) requires a documented multi-step workaround to strip a
  wildcard route from an auto-created Access application — extra
  surface for the exact gate this project depends on (§2 decision 3,
  v1.9) to be configured correctly.

Everything else about v1.9's decision 3 is unchanged: the site sits
behind Cloudflare Access, the repo stays public, and Supabase Auth + RLS
remain the separate and sole write boundary for `/log` — v1.9's binding
rule 3, unaffected by which Cloudflare product serves the static files
(§11 rule 7).

**2. Deploy mechanism — new, forced by the failed first deploy above.**
Workers static-assets deploys run via `npx wrangler deploy`, which reads
`web/wrangler.jsonc`:

```json
{
  "name": "luca-dashboard",
  "compatibility_date": "2026-08-09",
  "assets": {
    "directory": "./dist"
  }
}
```

This is an assets-only Worker — there is no Worker script, so the config
carries no `main` property, and `assets` carries no `binding` field
(Cloudflare's own migration guidance: `binding` is only valid once a
Worker script exists to bind the assets *to*). The project's Cloudflare
dashboard root directory must be set to `web`, not `/` — the `ENOENT`
above was exactly this being wrong, not a Wrangler problem.

**3. Two build entries still serve correctly — verified, no config
added.** §4's two static entries (v1.10) need no change under Workers:
`dist/index.html` and `dist/log/index.html` are both present after
`npm run build`, and Workers' static-assets serving resolves a request
to `/log/` to `log/index.html` via the same directory-index handling
that serves `/` from the root `index.html` — this is the platform's
default `html_handling` behaviour, not something this config opts into.
No `not_found_handling` setting is added: nothing about this deploy
needs a SPA-style catch-all fallback, since there is still no
client-side router (§4, v1.10) for a missing route to fall back to — an
unmatched path should 404, not silently serve `index.html`.

`VITE_BASE_PATH` stays unset, unchanged by this amendment — see §4's
closing paragraph, updated below.

---

**Amendments in v1.12 (10 Aug 2026)** — the Workers deploy went live and
Cloudflare Access was verified against it; four items, none reversing a
decision above.

**1. First successful deploy.** Build #b3486589 (commit `7216a92`)
deployed the assets-only Worker described in the v1.11 amendment. The
site now serves live at the production hostname
`luca-dashboard.luc-panetto.workers.dev`.

**2. Cloudflare Access verified.** The Access policy on the production
hostname was checked today from a logged-out browser and confirmed to
gate the site as intended: Include → Emails → a single address,
one-time-PIN as the sole identity provider (`Accept all available
identity providers` off), session duration 1 month. This confirms §2
decision 3 and §11 rule 7 as implemented, not merely configured.

**3. Preview URLs disabled — forced by a second public hostname the
deploy created unasked.** Deploying created a second hostname,
`*-luca-dashboard.luc-panetto.workers.dev`, serving the same site,
because `preview_urls` was absent from `web/wrangler.jsonc` and
defaults to enabled; the deploy log warned about exactly this. That
hostname sits behind a separate Access application Cloudflare
generated automatically, carrying its own shared default policy — not
the one written for this project and verified in item 2 above. This
repo only ever deploys from `main` (CLAUDE.md); there is no preview
workflow for a preview hostname to serve, so the second hostname was a
second gate to keep correct for no benefit. `preview_urls: false` is
added to `web/wrangler.jsonc` (§2 decision 3's code block, above) to
remove the hostname at the config level rather than rely on an Access
policy to guard it. `workers_dev` stays unset (enabled) — that setting
controls the production `workers.dev` hostname verified in item 2, not
the preview one, and disabling it would take the live site down.

**4. Access's Audience tag and JWKs values are not used anywhere in
this repo.** Those exist to let a Worker's own script validate a
`Cf-Access-Jwt-Assertion` header on incoming requests. This is an
assets-only Worker (v1.11 item 2 — no `main`, no script), so there is
no code path that could ever check that header. Access enforcement
happens entirely at Cloudflare's edge before a request reaches the
asset handler; nothing downstream needs to re-verify it.

Everything else is unchanged: **Cloudflare Access is not a substitute
for Supabase RLS** (v1.9 binding rule 3, §11 rule 7). Access gates the
deployed site; RLS and the `authenticated`-role grants remain the sole
write boundary for `/log`, exactly as before this amendment.

---

**Amendments in v1.13 (10 Aug 2026)** — forced by writing
`compute/build_data.py`, the first real output artifact
(`web/public/data/shin_series.json`, backing §8.3's shin-vs-rolling-km
panel). Two decisions this required, neither previously in this file:

**1. The shin "in band" threshold** — added to §7's `shin_series` row
and §10's marker-state paragraph. `shin = 0` is `in_band`; 1–3 is
`out_of_band`. Full reasoning recorded in both places above, not
repeated here.

**2. `compute/metrics.py` stays pure; the Supabase-fetch-and-write
driver is a separate file, `compute/build_data.py`.** §4's architecture
diagram labels the compute stage "metrics.py — strips coordinates,
writes public/data/*.json," and the v1.6 amendment's grants note says
"`metrics.py` runs headless" — both read, literally, as `metrics.py`
itself doing the fetch and the write. The code already didn't work that
way: `metrics.py`'s own module docstring states its functions are pure
("No network, no filesystem, no Supabase client") and names
`compute/report_live.py` as where driver logic belongs, precisely so
CLAUDE.md rule 3 — "metric definitions live in `compute/metrics.py`
only" — is never blurred by fetch/write plumbing. `report_live.py`
itself is documented as a one-off, read-only acceptance script, not the
production writer, so it was left alone; `build_data.py` is the new
production driver, importing `shin_series` and `assert_no_private_keys`
from `metrics.py` and doing nothing else metric-shaped. §4's diagram
label and the v1.6 grants note both describe "the compute stage" by its
best-known file, the way `sync.py` stands in for all of ingest above
it — not a literal claim that no other file in `compute/` may touch a
socket. Existing convention won over the diagram's literal wording;
flagged here rather than silently resolved, per this file's own
opening instruction.

---

**Amendments in v1.14 (10 Aug 2026)** — deployment moves into GitHub
Actions, replacing Cloudflare's own Git integration. Forced by two
findings, not a preference: Cloudflare's build image has no Python and
no Supabase credentials, so it can never produce
`web/public/data/*.json` (§4, gitignored per CLAUDE.md Layout — it is a
build artifact, never committed); and the deployed `/log` route
rendered blank because Cloudflare's build had no `VITE_SUPABASE_URL` /
`VITE_SUPABASE_PUBLISHABLE_KEY` configured ("Build variables: None" in
the deployment settings). GitHub Actions already holds every credential
this pipeline needs (CLAUDE.md rule 8) — the alternative was
maintaining the same secrets in two systems.

**1. Two workflows, not one job added to `sync.yml`.** `sync.yml` is
unchanged — same schedule, same Garmin token cache, same secrets, same
public-log discipline (v1.8). A new `.github/workflows/deploy.yml` runs
compute → build → deploy. Kept separate because `sync.yml` is a proven,
already-hardened pipeline and deploy's two very different trigger
shapes (chained after ingest vs. an independent frontend push) are more
conditional surface than `sync.yml`'s single job needs.

**2. Three triggers, one job.** `deploy.yml` runs on: `workflow_run`
chained after `sync.yml` (`workflows: ["Garmin sync"]` — the workflow's
exact `name:` field, confirmed against the file, not assumed); `push`
to `main`, with **no path filter** — a deploy is cheap, a missed deploy
is a silent staleness bug that only surfaces as confusion about why a
change didn't appear; and `workflow_dispatch`, for manual triggering
from the Actions tab. Neither trigger ever runs `sync.py` — `build_data.py`
runs fresh on every deploy regardless of trigger, since
`web/public/data/*.json` is gitignored and does not exist in a fresh
checkout.

**3. Ingest failure skips deploy entirely — no "deploy with yesterday's
data" fallback needed.** `deploy.yml`'s job carries
`if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'`.
`workflow_run` fires on every conclusion, not just success, so this
gate is required, not redundant. No special fallback path exists
because none is needed: Cloudflare keeps serving the last successful
deploy automatically until a new one lands, so skipping deploy *is*
"keep serving yesterday's data." Deploying anyway would risk freezing a
partially-written Supabase state into a confidently-served build if
`sync.py` failed mid-run. Failure stays loud via `sync.yml`'s own
existing exit-non-zero/notification behaviour (v1.8), unaffected by
this amendment.

**4. The compute test suite is a deploy gate.** `deploy.yml` runs
`python -m pytest compute/tests` before `build_data.py`; any failure
fails the job and nothing downstream (compute, build, or deploy) runs.
Not previously enforced anywhere in CI — CLAUDE.md's "no metric ships
untested" now has a real gate behind it, not just a local convention.

**5. Concurrency: serialised, never cancelled mid-flight.** `deploy.yml`
carries `concurrency: {group: deploy, cancel-in-progress: false}`. Two
triggers can fire close together (a push landing right as the
post-cron deploy starts); two concurrent `wrangler deploy` runs against
the same Worker is a real failure mode. Unlike `sync.yml`'s Garmin
token cache concern (also `cancel-in-progress: false`, for a different
reason), the reasoning here is that an in-flight deploy should finish
publishing, not be cut off partway through.

**6. Four new Actions secrets — none created by this amendment; all
are the athlete's action in the Cloudflare/Supabase dashboards.**

- `CLOUDFLARE_API_TOKEN` — scoped to this Cloudflare account only,
  created from Cloudflare's built-in **"Edit Cloudflare Workers" API
  token template**. Chosen over a hand-tightened custom scope
  (`Account.Workers Scripts:Edit` alone would likely suffice for an
  assets-only Worker with no custom domain route) because it is
  Cloudflare's own tested default for `wrangler deploy`, and a
  too-narrow token costs a debugging round-trip against a production
  deploy path. Recorded here by template name so the token is
  reproducible if it ever needs recreating.
- `CLOUDFLARE_ACCOUNT_ID` — not sensitive by itself, stored as a secret
  anyway for the same "one place for pipeline config" reason as the
  next two.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — the publishable
  values `web/.env.example` already documents, named identically. These
  are **not confidential** — §11 rule 5 already establishes the
  publishable key ships in the client bundle by design — storing them
  as Actions secrets is a consistency choice (one place for all
  pipeline config), not a security requirement. Passed as `env:` on the
  `npm run build` step only, since Vite's `VITE_*` variables are baked
  into the bundle at build time by static replacement. The
  `SUPABASE_SERVICE_ROLE_KEY` secret `sync.yml` already has is reused
  by the compute step for `build_data.py` — no new Supabase secret
  needed — and is never present in the build step's `env:` block; it
  must never reach `web/` or any client bundle (CLAUDE.md rule 8).

**7. Cloudflare's Git integration is not yet disconnected.** This
amendment ships the GitHub Actions workflow; disconnecting Cloudflare's
own Git integration (Cloudflare dashboard → Workers project → Settings
→ Builds) is a separate, manual dashboard action left for the athlete,
deliberately not attempted by this change. Until it happens, a push to
`main` triggers **both** pipelines — Cloudflare's own build (still
missing its `VITE_*` variables, so `/log` stays blank on that path) and
this workflow. The two do not conflict destructively — Cloudflare
serves whichever deploy landed last — but the redundancy should be
closed once this workflow is proven.

**8. First runs are expected to fail.** None of the four secrets above
exist yet at the time this amendment lands. The "verify required
secrets are configured" step (same pattern as `sync.yml`: check each
secret is non-empty, name which one is missing, never print a value)
will fail closed on the first push-triggered run, by design — that is
the correct behaviour, not a bug to chase.

**Amendments in v1.15 (10 Aug 2026)** — forced by `deploy.yml`'s first
real run (commit `998cc03`, workflow run #3), which passed every step
— secrets check, `pytest`, `build_data.py`, `npm ci`, `npm run build` —
and failed only at `cloudflare/wrangler-action@v3`:

```
✘ [ERROR] Missing entry-point: The entry-point should be specified via
the command line (e.g. `wrangler deploy path/to/script`) or the `main`
config field.
```

**1. Root cause: `wrangler-action`'s default Wrangler is v3; assets-only
Workers need v4.** Left unpinned, `cloudflare/wrangler-action@v3`
installed Wrangler 3.90.0. Under Wrangler 3, a config with no `main`
field is invalid — but `web/wrangler.jsonc` has no `main` by design
(v1.11 item 2: no Worker script, static assets only, so no `main` and
no `assets.binding`). Assets-only Workers are a Wrangler 4 feature.
Cloudflare's own Git-integration build (still connected per v1.14 item
7) ran Wrangler 4.120.0 against this identical, unmodified config on
the same day and deployed successfully — confirming the config was
always correct and the action's default tool version was the only
thing wrong.

**2. Fix: pin `wranglerVersion: 4.120.0` on the deploy step. No config
change.** `web/wrangler.jsonc` is untouched — no `main`, no
`assets.binding` added. Adding either would convert the assets-only
Worker into a scripted one and contradict v1.11. 4.120.0 specifically,
not a floating `4` or `latest`, because an unpinned deploy tool is a
silent-breakage risk the same way an unpinned Python or Node version
would be, and 4.120.0 is not a guess — it is the exact version
Cloudflare's own build already proved works against this config. The
pin must be revisited if `web/wrangler.jsonc`'s assets configuration
ever changes (e.g. a future scripted Worker with a real `main`), since
a version proven for an assets-only config is not automatically proven
for a different one.

---

**Amendments in v1.16 (10 Aug 2026)** — the §8.3 shin-vs-rolling-km panel
is built and rendered on the index route (`web/src/panels/`), reading
`web/public/data/shin_series.json` (v1.13) and never recomputing `band`
or `understated_volume` (CLAUDE.md rule 3). ECharts (CLAUDE.md's stated
stack) is added as a `web/` dependency for this reason — the render
logic itself lives in a pure option-builder, `shinVolumeChart.ts`, tested
the same way `compute/metrics.py` is (CLAUDE.md "no metric ships
untested," extended to this render layer). Two rendering-phase decisions
this required, explicitly left open by §8.3 and §9:

**1. Understated-volume treatment (§8.3's binding v1.7 requirement) —
a diagonal hatch, not desaturation or a solid tint.** Rendered as an
inline-SVG pattern fill (a small tiled diagonal line, at 35% opacity)
under the `rolling_7d_km` line, present only where `understated_volume`
is `true` for that day — read directly off the JSON, so the 8-Aug-2026
cutoff is never hardcoded in the frontend. Chosen over desaturation
because desaturation has nothing to desaturate here: the measured
portion of this line carries no colour treatment to begin with (no
continuous reference band exists for `rolling_7d_km` in §7, so there is
no lane fill on this chart at all outside the hatch) — a hatch reads as
"uncertain measurement" on its own, where a partial-opacity tint would
be easy to misread as the reference-band lane fill (§10) used elsewhere
in the system, which is exactly what the v1.7 requirement says this
must be distinct from.

**2. Minimum-data state for a near-empty range — a caption, not a
lock.** Below `MIN_RANGE_DAYS_FOR_TREND = 7` days of range (one rolling
window), the panel adds a muted, non-judgemental caption under the
coverage line: `early days — range is shorter than one rolling 7-day
window (n days)`. The chart itself still renders in full — this is not
Lab-panel gating (§8.4, CLAUDE.md rule 7's `min_n` lock is explicitly
scoped to Lab panels only) — because the panel makes no population-level
claim at any range length; it plots raw daily readings, which are true
regardless of n. The caption exists only so a two-point line spanning
the panel's full width is never mistaken for a multi-week trend. Seven
was chosen, not measured: it is the width of the metric being plotted
(`rolling_7d_km`) rather than an invented statistical threshold, so a
range shorter than its own window is definitionally too short to show
the window doing anything.

Also settled, not requiring a spec amendment because §10 already
specifies the encoding directly: the three shin marker states are a
solid dot (in band), a hollow ring of the same colour (out of band, §10
never uses colour for in/out), and a hairline unfilled ring sitting at
0 on the shin axis (not answered) — drawn as a separate scatter series
from the shin step line so a not-answered day is a real gap
(`connectNulls: false`) in the line, never a value.

Scope held to §8.3's one panel, per the task that produced this
amendment: no nav, no client router, no global range selector (§9,
still deferred to Phase 2 per v1.10), and no Today/Week/Lab pages.

---

**Amendments in v1.17 (10 Aug 2026)** — two faults found on the §8.3
panel's first live view, reported by the athlete. Neither changes a
metric formula (CLAUDE.md rule 3 held); both are rendering/driver
fixes.

**1. `rolling_7d_km` line had no legend entry — fixed, added to
`ShinVolumePanel.tsx`'s existing legend list.** v1.16 gave the three
shin marker states and the understated-volume hatch a legend entry
each but never named the `rolling_7d_km` line itself, the largest
element on the chart — the only cue was the small "km" axis label. A
fourth swatch style, `.legend-swatch--line` (a short azzurro bar, not
a circle — the existing swatch shapes were all built for point
markers), is added alongside the existing three, and a new first
`<li>` reads **"trailing 7-day running km (not weekly total)."** This
specific wording is deliberate, not a generic axis label: it is what
actually confused the athlete on first read — the panel gives a
trailing-window sum, not a Mon–Sun calendar-week total, and "running"
states plainly what CLAUDE.md rule 6 already enforces silently
(cycling excluded). No change to `shinVolumeChart.ts` — the option
builder was already correct; the legend is hand-authored HTML beside
the chart (`ShinVolumePanel.tsx`), same as the other four entries, not
an ECharts-native legend.

**2. Default range was 2-3 days, not a stated window — fixed in
`compute/build_data.py`.** `build_shin_series()` previously derived
`start` as `min(daily.date)` — a leftover from before the range was
ever a design decision, not a chosen window. Once `daily` held real
rows (only from 8 Aug 2026 onward, per §5/§6), this collapsed the
visible range to whatever `daily` happened to span, 2-3 days on first
live view, rather than showing anything resembling a trend. Two
direct consequences: the volume line had no shape, and the v1.7
understated-volume hatch never appeared, because the entire visible
range was already post-FR70 — the legend advertised a state (§8.3's
binding hatch requirement) with no instance on screen to show it.

**Decided: a fixed trailing 90-day window, ending at `today` (the
date the build driver already receives as its own current-date
argument — the freshest point a given run of `build_data.py` can
represent, not derived from any table's contents).** 90 days was
chosen, not measured, on one concrete requirement: it must reach back
past 8 Aug 2026 far enough that the v1.7 hatch is actually visible and
the volume line has real shape, without stretching to the full
2023-2026 Strava history, which would compress 90+ days of real
FR70-era detail into a few pixels for no benefit — nothing downstream
of this panel needs multi-year granularity (§9's global range selector
is deferred to Phase 2, and this panel has no range control of its
own yet). A pure `_default_range(today)` helper replaces the
`daily`-derived `start`, independently tested
(`compute/tests/test_build_data.py`) against the trivial case a live
Supabase fetch can't be — that it always returns exactly a 90-day
trailing window regardless of what `daily` or `activities` contain,
closing off a repeat of this exact bug.

**Verified against the live database (10 Aug 2026):** `daily` holds
two rows, 8 Aug (`shin=1`) and 9 Aug (`shin=0`) — no row yet for 10
Aug. Regenerating `shin_series.json` under the new range reports
coverage **2 answered / 90 days in range**, matching the task's
expectation exactly. This is correct and is not softened anywhere in
the render layer — §7's coverage rule ("declares its coverage as `n
answered / n days in range`") already requires stating it plainly, and
a range mostly older than `daily`'s own history is an honest
description of the data, not a bug to hide.

**`MIN_RANGE_DAYS_FOR_TREND`'s trigger is re-checked, not changed.**
v1.16's minimum-data caption keys off `coverage.total` (range length in
days), not `coverage.answered` (days with a real shin value) — at the
90-day range this now renders, `total = 90 ≥ 7`, so the caption is
correctly absent even though `answered` is only 2. This is still the
right trigger: the caption exists to stop a short *range* from reading
as a multi-week trend (v1.16's own reasoning, tied to `rolling_7d_km`'s
own 7-day window, not to how many days happen to have a logged shin
value) — `rolling_7d_km` itself is never null and plots for every day
in range regardless of `daily` coverage (§7), so the line's shape is
genuinely trustworthy at 90 days even with only 2 shin answers. A
separate low-*answered* state was considered and rejected: the shin
step series already renders sparse answers honestly via its own
three-state marker encoding (§10) and the coverage caption beneath the
chart, with no population-level claim for a caption to protect against
(§3.4/§8.4's `min_n` gating is explicitly Lab-only, CLAUDE.md rule 7)
— a second caption keyed on `answered` would duplicate information the
marker states and coverage line already carry.

---

## 1. What this is

A private-by-design training dashboard — public source repo, privately-hosted
site behind Cloudflare Access (§2 decision 3, v1.9/v1.11; previously
publicly-hosted on GitHub Pages) — that answers four questions and refuses
to answer a fifth:

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
| 3 | Host = **Cloudflare Workers with static assets, site private behind Cloudflare Access** (superseded v1.9 — was GitHub Pages, public; superseded v1.11 — was Cloudflare Pages) | GitHub Pages has no access control outside GitHub Enterprise Cloud, and a client-side gate is theatre here — the JSON under `web/public/data/` is a directly-fetchable static file regardless of the HTML/JS. Cloudflare Zero Trust's free tier (≤50 users, $0/mo, verified 9 Aug 2026) includes Access with email one-time-PIN login. Repo stays public; the deployed site does not. Workers, not Pages, because Cloudflare is folding Pages into Workers going forward and protecting the default `*.workers.dev` subdomain with Access is a single toggle there, versus a documented multi-step workaround on Pages. See the v1.9 and v1.11 amendments above. |
| 4 | **No GPS coordinates ever leave the compute layer** | Public site + home-start runs = published absence schedule. No panel needs location. |
| 5 | **No surname anywhere on the site** | Health data, permanent, indexed, two years from a job market. |
| 6 | Charts = **ECharts**, interactive on all breakpoints | Native `dataZoom` for the range selector; tap-to-inspect is first-class. One codebase, no static mobile fork. |
| 7 | **No composite score** of any kind | §3. |
| 8 | Language = **English** | Matches coach files. |
| 9 | Strava = **one-time bulk archive import only**, then dropped | Seeds the full Strava export history (13 May 2023 → 7 Aug 2026, corrected in v1.5 from an earlier "Dec 2025" estimate made before the real export was inspected). Account data export, not the API — no subscription, no ToS question. |
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
│  metrics.py     — §7 definitions, strips coordinates    │
│  build_data.py  — headless driver, writes               │
│                   public/data/*.json (v1.14)             │
└──────────────────────────┬──────────────────────────────┘
                           │  GitHub Actions — deploy.yml,
                           │  chained after sync.yml (v1.14)
┌─ BUILD + DEPLOY ───────── ▼ ────────────────────────────┐
│  Vite + React + ECharts, two static entries (v1.10,     │
│  merge to single bundle + router deferred to Phase 2)   │
│  npm ci && npm run build → wrangler deploy (v1.14)      │
│  → Cloudflare Workers + static assets, gated by         │
│    Cloudflare Access (v1.9, host updated v1.11)         │
│  /log = second entry → Supabase Auth + RLS (write)      │
└─────────────────────────────────────────────────────────┘
```

**The frontend is dumb.** It reads pre-computed JSON. It holds no credentials,
performs no aggregation, and contains no metric definitions. Every number on
screen was computed in `metrics.py` and is therefore testable and versioned.

**Coordinate stripping is a hard gate in `metrics.py`**, not a rendering choice.
Latitude and longitude are dropped before any file is written to `public/`. A
unit test asserts no output JSON contains a key matching `/lat|lon|coord|polyline/`.

**Compute, build, and deploy all run in GitHub Actions — added v1.14,
replacing Cloudflare's own Git integration.** `.github/workflows/deploy.yml`
runs `build_data.py`, then `npm ci && npm run build` in `web/`, then
`wrangler deploy` — chained after `.github/workflows/sync.yml` via
`workflow_run`, and independently on every push to `main` and on manual
`workflow_dispatch`. See the v1.14 amendment below for the full design
and the secrets this requires. Cloudflare's Git integration (the source
of the `/log` blank-page bug this amendment fixes — it never had the
`VITE_*` build variables configured) is superseded by this workflow but
**disconnecting it in the Cloudflare dashboard is a pending manual step,
not yet done** — until it is, both pipelines will attempt to build and
deploy on every push to `main`.

**Two build entries, retained until Phase 2 (v1.10) — v1.9's planned
single-bundle merge deferred, not reversed.** The render layer is a
static multi-page build — `web/index.html` (public dashboard) and
`web/log/index.html` (the write surface) — originally for one stated
reason: **the public dashboard bundle contained no auth code, no
Supabase client, and no write path**, kept out of a bundle any anonymous
visitor could load. That reasoning depended on the dashboard bundle
being publicly reachable; it no longer is, now that Cloudflare Access
(§2 decision 3, v1.9) gates the entire site at the edge — the only
person who can reach any bundle, dashboard or `/log`, is the
authenticated athlete. v1.9 took that as license to merge the two
entries into one app, one bundle, with a client-side router. v1.10
keeps them separate for the first deploy: removing the *need* to split
the bundles didn't create a *need* to merge them, and there is no
second page yet for a router to route to (Week and Block don't exist).
Two static entries deploy correctly under Cloudflare Workers’ static
assets — a request to `/log/` resolves to `log/index.html` via the
same directory-index handling `index.html` gets at the root, no extra
configuration required (v1.11) — so the merge is deferred to **Phase
2**, when Week and Block exist and a router has somewhere to route. Accepted
explicitly, per v1.9, and unchanged by this deferral: the Supabase
publishable key ships in the `/log` entry, not the dashboard entry, for
now — see the v1.9 amendment above for why shipping it in either is
safe (RLS and the `authenticated`-role grants were always the actual
write boundary, never the bundle split). All fonts are self-hosted; the
site makes no third-party requests beyond the Cloudflare Access
authentication flow itself.

**Raw archives and backups never touch the repo.** They live in private
Supabase Storage buckets. `archive/` holds unstripped Garmin JSON — GPS
polylines and start locations included — and `backups/` holds `pg_dump` output
including the free-text `journal` column. Neither passes through the
coordinate-stripping gate, so neither may reach a public repo. See §11.6.

**`VITE_BASE_PATH`** was the deploy-time variable carrying the GitHub Pages
*project-site* subpath (e.g. `/luca-dashboard/`), consumed by
`vite.config.ts` as the build's `base`. That premise is superseded by v1.9:
neither Cloudflare host serves from a repo-name subpath — Pages served from
the site root (custom domain or `*.pages.dev`), and Workers with static
assets does the same (custom domain or `*.workers.dev`, v1.11) — so this
variable's original purpose no longer applies under either. Its mechanism —
defaulting to `/` locally, so a developer never needs to set it to run the
dev server — is unaffected. **Closed by v1.10, unchanged by v1.11:** the
variable stays unset; `base` resolves to `/` under Cloudflare Workers
exactly as it does locally, so there is nothing deploy-specific left for
it to carry.

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
| `journal` | text | prompt (v1.9, superseded — see below): *"What might affect tonight's sleep?"* |

**The null rule for `shin` — binding on every layer.**
`shin` is nullable and has **no default**. `NULL` means *not answered*; `0`
means *assessed, no pain*. Collapsing the two would print a false all-clear on
the shin-vs-rolling-km panel, which is the primary periostitis warning on the
site — the one chart the dashboard exists for. Therefore:

- The `/log` form never pre-selects a value and refuses to submit without one,
  so `NULL` can only ever mean *a day that was never logged*.
- `metrics.py` never coerces, fills, interpolates, or zero-fills it.
- The render layer gives it a third marker state — see §7 `shin_series` and §10.

**Temporal semantics of `daily` — binding, added v1.9.** A `daily` row's
`date` is the calendar day the *behaviours* happened, not the day their
effects show up in `biometrics`. Garmin files a night's sleep under the
**wake** date — confirmed against the one real `biometrics` row as of this
amendment: the FR70's first night (7–8 Aug 2026) produced a row dated
2026-08-08. Every habit field above (`creatine` through `study_hours`) and
`journal` describe behaviour affecting the *following* night's sleep — any
join to `biometrics.sleep_total_min` / `rhr` / `hrv_overnight` or similar
must be at `daily.date + 1`, never same-date. `shin` and `illness` are the
exception — same-day state, joined at date + 0, same as `shin_series`
below. Full reasoning, the live-data check, and the precedent in
`impact_mechanics`'s own date+1/date+2 joins: see the v1.9 amendment
above. Binding on §8.4 (Lab) and any future analysis.

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
measurements — for a mix of two reasons, corrected in v1.5.**
`avg_vertical_oscillation`, `avg_vertical_ratio`, and
`avg_ground_contact_ms` are NULL on every `source = 'strava'` row because
the export genuinely has no such columns. `avg_cadence` is also NULL on
every `source = 'strava'` row, but not because the field is absent — the
export does carry an "Average Cadence" column, in Strava's own per-leg
strides/min convention, never confirmed equivalent to Garmin's
`summaryDTO.averageRunCadence` (full steps/min, this table's own mapping
above) that `impact_mechanics` (§7) joins it against across sources. It
is deliberately not imported rather than risk silently corrupting that
join. `avg_hr` / `max_hr` may also be NULL, when the export row itself
leaves them blank. NULL here always means either "the source never
carried this value" or "carried but not trusted to be comparable," never
"went unmeasured." Any metric consuming these columns must handle NULL
rather than assume presence.

**`distance_km` on `source = 'strava'` rows is a floor, not a
measurement — added v1.7, binding.** Every Strava-era run was tracked on
a phone via Zepp, which is unreliable and frequently cut runs short,
especially at save time — a device/tracking failure upstream of the
export, not an ingest bug. Confirmed against the athlete's own
Airtable-recorded ground truth (week of 27 Jul – 2 Aug 2026): the Sunday
long run's `distance_km` (6.9713) undercounts the athlete's confirmed
true distance (11.04 km, verified via a wristband backup) by ~37%, while
the recorded `duration_s` matches the true elapsed time almost exactly —
the truncation cuts distance tracking specifically, not the clock. The
same week's other four running days match the athlete's own reconciled
figures within ~1%. The undercount is real, unknown in size per row,
and uneven — not a fixed percentage that could be back-corrected by a
formula. See the v1.7 amendment above and §7's matching note.

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

**Added v1.7 — `weekly.actual_km` is more accurate than `activities`-derived
`weekly_km` for the overlap period.** For 20 Jul 2026 onward (when the
athlete's own Airtable Sessions/Weekly logging began — no record exists
before that date), the athlete's recorded `Actual km` is reconciled
against multiple sources (track laps, wristband backups), not solely
dependent on the same phone GPS that undercounts `activities.distance_km`
(§5's `activities` section, this amendment). Confirmed for the two weeks
with real Airtable data: 20–26 Jul 2026 matches closely (30.17 vs 30.2
km); 27 Jul – 2 Aug 2026 does not (30.10 vs 34.4 km, gap explained
above). See §13 for the open question this raises about which table
pre-FR70 volume metrics should read from.

---

## 6. Ingest

**Superseded by v1.2 (§12 note):** the watch arrived before the ingest layer
was built, so there is no hand-written-fixture stage. `garmin_client.py` is
written directly against the real `python-garminconnect` API. Fixtures in
`ingest/fixtures/` are captured real API responses, saved so every layer
above ingest can be built and tested against a stable, real-shaped snapshot
without hitting the live API on every run — the fixtures now record actual
observed responses rather than a hand-authored guess at their shape.

**Garmin auth (superseded by v1.8 amendment above):** the cached `garth`
token directory is persisted across scheduled runs via `actions/cache`,
not "stored in GitHub Actions secrets, refreshed by the job" as this
sentence previously and incorrectly said — a workflow cannot write back
to its own secrets. See the v1.8 amendment for the actual mechanism, the
`GARMIN_TOKEN_SEED` bootstrap secret, and the cache-miss/MFA handling.
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
| `rhr_baseline` | 30-day rolling median. Band = ±1 MAD. **Never spans the device break.** **`min_n = 14` days post-device-break** (added v1.6) — below that, a near-empty window collapses the MAD band to near-zero width and would falsely flag every subsequent day as out-of-band; the metric returns insufficient-data below `min_n` instead. |
| `hrv_baseline` | 7-day mean vs 30-day mean, plus Garmin's own HRV Status when available. Requires ≥ 21 days on FR70 before rendering at all. |
| `impact_mechanics` | Per run: `avg_cadence`, `avg_vertical_oscillation`, `avg_vertical_ratio`, joined to `daily.shin` at date + 1 and date + 2. |
| `shin_series` | `daily.shin` joined to `rolling_7d_km` by date. **`NULL` is never coerced to `0`.** A missing day renders as a gap in the step series with a distinct unfilled marker on the date axis — not a value, not a zero. Every panel consuming shin declares its coverage as `n answered / n days in range`. **Added v1.13 — the §10 band threshold for shin's marker state: `shin = 0` is `in_band`; `shin` 1–3 is `out_of_band`; no row is `not_answered`.** Each entry also carries `understated_volume` (v1.7's pre-8-Aug-2026 floor-not-measurement flag, §8.3). Both are computed by `shin_series` itself, not derived by the frontend (CLAUDE.md rule 3). |

**Added v1.7 — floor, not measurement, for any range ending before
2026-08-08.** `weekly_km`, `ramp_pct`, `rolling_7d_km`, and
`rolling_28d_km` all sum `activities.distance_km`, which on
`source = 'strava'` rows carries an unknown, uneven undercount from
unreliable pre-FR70 phone tracking (§5's `activities` section). No
formula above changes — this is a caveat on the input, not the
calculation: every value these four metrics return for a range ending
before 8 Aug 2026 is a floor on true volume, never a precise measurement,
and `ramp_pct` specifically may read a smaller ramp than actually
occurred if either week in the comparison predates 8 Aug 2026.

**Added v1.6 — data shape for the four segment-dependent metrics above.**
`easy_band_compliance`, `medio_control`, `aerobic_efficiency`, and
`decoupling` all reference a portion of a run narrower than the whole
activity (a warm-up-excluded steady segment, a first-half/second-half
split, "the medio segment"). No table stores per-run splits or streams
today — see the new `laps` phase, §12. Each is implemented in
`compute/metrics.py` as a pure function against its binding definition
above, taking already-segmented per-lap data (time-in-run, pace or
speed, HR) as an argument, plus — for `easy_band_compliance` and
`medio_control` — a caller-supplied list of runs already classified as
easy/medio (a `sessions`-driven classification, out of scope until Phase
2). The function bodies are correct and tested against hand-checked
synthetic segment data; run against the real database today, with no
ingest path yet producing that input, all four return the explicit
insufficient-data signal.

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

**Added v1.7 — binding rendering requirement, not a note.** Any portion
of the shin-vs-rolling-km panel before 2026-08-08 plots `rolling_7d_km`
built from `source = 'strava'` distances, which §5/§7 record as an
unknown, uneven floor on true volume (pre-FR70 phone tracking that
frequently cut runs short). Plotting understated mileage against real
shin scores on this specific panel is backwards for an early-warning
chart — it implies the shins tolerated less volume than they actually
carried, understating true risk rather than overstating it. The pre-8-
Aug-2026 portion of this panel **must** render with a visual treatment
distinct from the reference-band fill used elsewhere, marking it as
understated, and that portion **must not** be used, by this panel or any
other feature, to infer a volume-tolerance threshold. **Chosen in v1.16:
a diagonal hatch fill**, read from the JSON's `understated_volume` flag
day-by-day rather than a hardcoded cutoff — see the v1.16 amendment for
the reasoning.

### 8.4 Lab — locked by default
Correlation matrix, weekday effects, bedtime-vs-recovery scatter, habit impact.

Each panel declares `min_n` and **renders a locked state below it**:

```
insufficient data — 14/60 days
```

Thresholds: ≥ 60 days per variable, ≥ 20 observations at each level of a binary,
and the device break resets the count. No exceptions, no override, no "preview".

**Join rule — binding, added v1.9.** Every `daily` habit field
(`creatine`, `protein_breakfast`, `alcohol`, `late_meal`, `device_in_bed`,
`cold_room`, `breathing_exercises`, `stretching`, `study_hours`) and
`journal` join to `biometrics` at **`daily.date + 1 = biometrics.date`** —
Garmin files a night's sleep under the wake date, so a habit logged for
day N affects the `biometrics` row dated N+1, never the row dated N.
`shin` and `illness` join at **date + 0** — same-day state, not a
forward-looking habit. See §5's "Temporal semantics of `daily`" for the
full reasoning and the live-data check this rests on. No Lab panel may
join `daily` to `biometrics` same-date.

**Note on interpretation, written into the page itself:** these panels show
association only. Observational habit data cannot establish causation — the
prior Bevel logs produced *device in bed improves sleep* and *10,000 steps harms
recovery*, both artifacts of self-selection. Causal questions require n-of-1
alternating-block trials, which are a training decision, not a dashboard feature.

### 8.5 Log — the write surface  *(settled 8 Aug 2026)*

A separate build entry, `web/log/index.html`, serving at `/log/` (§4 —
v1.9 planned a route reachable from the dashboard's own in-app navigation
instead, but v1.10 defers that bundle merge to Phase 2; until then there
is no router, and `/log/` is reached by URL, not by a nav link), authenticated,
phone-first, single column, no desktop layout. Reaching the app at all
requires an authenticated Cloudflare Access session (§2 decision 3, v1.9);
independently of that, this route's own Supabase sign-in is email + password
only — no signup UI, no magic link, no reset UI, because public signups are
disabled. Cloudflare Access is not a substitute for this sign-in step — see
the v1.9 amendment's binding rule 3. Sign-in failures are shown inline with
the real error text, never a generic "something went wrong" — the same
transparency rule already binding on save failures below.

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
| 7 | **Journal** | `journal` | Prompt is the label: *"What might affect tonight's sleep?"* (v1.9 — see §5's temporal semantics note; replaces the original, tense-ambiguous prompt). One line high, grows on focus. Optional. |
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

**Added v1.13 — "in band" for shin, binding.** Unlike RHR/HRV/pace, `shin`
has no naturally continuous band — it's a 0–3 ordinal. `shin = 0` is the
only in-band (solid marker) value; 1–3 is out of band (hollow). A 0–1
split was considered and rejected: `full_plan.md`'s autoregulation table
treats any shin whisper as an amber trigger, and the athlete's standing
protocol acts on any reading above 0, so a 0–1 split would render a shin
of 1 as a solid in-band marker on the primary periostitis early-warning
chart — hiding the first signal the chart exists to surface. The
conservative direction on an early-warning chart is to flag sooner, not
later. This does not replace the raw 0–3 ordinal, which still drives the
step series' height (§7) — the band only drives marker fill state.

**Red/green is not used for in/out.** Red is a judgement about the athlete;
"outside the band" is information about a session. Fill-vs-hollow carries the
same information, survives colour-blindness, and doesn't editorialise.

---

## 11. Privacy rules

1. No latitude, longitude, polyline, or start location — stripped in compute, asserted by test.
2. No maps. No route panels. Ever.
3. No surname, no club name, no photograph.
4. The dashboard is read-only. All writes go through authenticated `/log`,
   which requires its own Supabase sign-in regardless of what gates the
   site itself (v1.9 rule 3, below).
5. Secrets exist only in GitHub Actions secrets. Never in the repo, never in the
   dashboard bundle. The one exception is the Supabase **publishable** key,
   which is public by design and ships in the `/log/` entry only, for now —
   v1.9 planned for it to ship in a single combined bundle once the two
   build entries merged, but v1.10 defers that merge to Phase 2, so the
   render layer still has two build entries and the key stays out of the
   public dashboard entry (see §4). RLS plus table-level grants to
   `authenticated` only are the actual boundary, not which bundle the key
   ships in.
6. **`archive/` and `backups/` are permanently gitignored and live in private
   Supabase Storage buckets.** The repo is public. `archive/` holds unstripped
   Garmin JSON (polylines, start locations); `backups/` holds `pg_dump` output
   including `journal`. Neither passes the §4 coordinate gate, so neither may
   ever be committed.
7. **Cloudflare Access is not a substitute for RLS — binding, added v1.9.**
   Access (§2 decision 3) gates the deployed *site*: whether a request
   reaches Cloudflare's edge with a valid authenticated session at all. It
   is a separate, additional layer in front of rule 4 above, not a
   replacement for it. It carries no Supabase claims and is invisible to
   PostgREST; RLS and the `authenticated`-role grants (CLAUDE.md rule 10)
   remain the sole write boundary for `/log`, exactly as before Access
   existed. See the v1.9 amendment's binding rule 3 for the full reasoning.

---

## 12. Roadmap

| Phase | Trigger | Deliverable |
|---|---|---|
| **0** | Now | Supabase project ✅, `daily` table + RLS + grants ✅, `/log` route ⏳. Logging starts the night `/log` ships. |
| **1** | Watch arrived (8 Aug) | Repo scaffold, Actions pipeline, `garmin_client.py` against the real API, `biometrics`/`activities` migration + RLS + grants, `metrics.py`, backfill, device-break marker, Week + Block off `sessions` data, Today goes live |
| **1.5** *(added v1.6)* | Not yet scheduled — blocks 4 metrics below | New `laps` table + ingest path. Added v1.6, discovered writing `compute/metrics.py`: `easy_band_compliance`, `medio_control`, `aerobic_efficiency`, and `decoupling` (§7) each need per-run split/segment data (warm-up-excluded steady segment, first-half/second-half, "the medio segment") that no table stores today. Garmin's `get_activity(id).splitSummaries` already carries per-lap distance/duration/pace/HR and contains no coordinate-shaped keys (confirmed against the real fixture, `ingest/fixtures/garmin_activity_summary_23902996105.json`) — a `laps` table sourced from it is the actual fix, not a metric-definition change. Until this phase ships, those four metrics are implemented as correct pure functions with no real data to run on (§7). |
| **2** | 17 Aug — Meso 1 boundary | Port `sessions`/`weekly`/`benchmarks` from Airtable. `easy_band_compliance`/`medio_control` additionally need Phase 1.5 before they render against real data — classifying a run as easy/medio is a `sessions` concern, but the segment data itself comes from `laps`. |
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
4. *(added v1.7)* `weekly.actual_km` (Airtable-ported, §5) is more
   accurate than `activities`-derived `weekly_km` for the 20 Jul 2026
   onward overlap period, since `activities.distance_km` on
   `source = 'strava'` rows is a confirmed, uneven undercount (§5, §7).
   Should pre-FR70 volume metrics (`weekly_km`, `ramp_pct`,
   `rolling_7d_km`, `rolling_28d_km`) read from `sessions`/`weekly`
   instead of `activities` for dates before 2026-08-08 once that table
   ports at Phase 2 (17 Aug)? And if so, how does a metric reading from
   two different tables depending on date reconcile with CLAUDE.md rule
   3 — "metric definitions live in `compute/metrics.py` only," read
   until now as one formula, one source table, per metric? Not answered
   here — flagged for the 17 Aug port, when `sessions`/`weekly` actually
   exist to read from.

5. *(added v1.8)* Does the Garmin account behind `GARMIN_EMAIL` have MFA
   enabled? Not yet confirmed either way. It doesn't block `sync.yml`
   shipping — the token-cache design resumes a session rather than
   performing a fresh login in CI regardless of the answer — but it
   determines what happens the day the cache is ever fully lost: with MFA
   on, the recovery procedure in the v1.8 amendment (local interactive
   login, re-seed `GARMIN_TOKEN_SEED`) is mandatory, not optional, since a
   fresh login inside the workflow will fail immediately. Confirm next
   time a fresh local login happens, and record the answer here.

**Resolved in v1.1 and moved out of this list:** null-vs-zero for `shin`
(§5, §7, §10); `/log` form layout (§8.5); archive/backup location (§4, §11.6).
