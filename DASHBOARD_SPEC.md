# Training Dashboard — Build Spec v1.30

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
**§9's global range selector is now built for the §8.3 panel**
(`7d · 30d · 90d · 6m · 1y · all`), plus a hover tooltip and a fix for
not-answered-marker crowding at wide ranges — three more faults the
athlete found on live view. §9's per-range mean/delta and the
tap-to-inspect detail drawer remain explicitly deferred — see the v1.18
amendment below and §13.
**`sessions`/`weekly`/`benchmarks` now exist** — migrations 006/007,
Phase 2 (§12), ahead of the 17 Aug Meso 1 boundary. `sessions` carries
no `shin` column; `activities.session_id`'s foreign key (deferred since
migration 002) is now in place. See the v1.19 amendment below and §5.
**The one-time Airtable port has now run** — `ingest/airtable_port.py`,
28 `sessions`/10 `weekly`/4 `benchmarks` rows written (one undated
Benchmarks row skipped), verified idempotent by running twice, and
`activities.session_id` backfilled (35 rows linked; every remaining
`NULL` predates the 20 Jul 2026 Airtable logging start). This is a
snapshot, not a live sync — see the v1.20 amendment below for what that
means and for the two decisions this run required that the spec didn't
already cover.
**The 20 Jul – 7 Aug 2026 `daily.shin` recovery deferred by v1.19 has now
run, partially** — four dates recovered from a number stated in
`sessions.actual` for that specific day, three spans reviewed and
rejected by the athlete because the text described a state rather than
a day-specific number, and the rest of the window untouched. See the
v1.21 amendment below.
**The §8.3 understated-volume hatch is now full-plot-height, covering both
series** — v1.16's fill only reached the km line's own height, which left
the pre-FR70 `shin` readings v1.21 just inserted with nothing marking them.
The three shin marker states (§10) are unchanged. See the v1.22 amendment
below.
**v1.22's two-`setOption` workaround for the same panel is removed** — it
was based on an untested claim about ECharts markArea behaviour, isolated
and found wrong; a single `setOption` call resolves the markArea's bounds
correctly once the host series carries real data. Correction only, no
rendering change. See the v1.23 amendment below.
**`ingest/sync.py` now links `activities.session_id` on write, plus a
self-healing repair pass every run** — closes the gap where every
activity synced since 8 Aug 2026 landed with `session_id` `NULL`,
starting with 2026-08-12's "Easy Run," because the ongoing Garmin sync
had no `sessions` lookup at all. One `sessions` row per date is enforced
by `sessions_date_key` (migration 006, v1.19) — kept, not dropped. See
the v1.24 amendment below and §5.
**The dashboard now has a nav** — Today · Week · Block · Log, tabs backed
by React state rather than the client router §4/v1.9 anticipated, for
reasons specific to running unmaintained for weeks at a time. §8.3's shin
panel moved under Block unchanged; Today and Week ship as empty panel
shells reading "Not built yet," no placeholder data. See the v1.25
amendment below.
**§8.1 Today is now built — all three panels, replacing their empty
shells.** "Last night" deliberately ships with **no reference band**: the
only baselines that exist were recorded on the Amazfit and don't transfer
to the FR70 (CLAUDE.md rule 5), so the panel shows the raw values, a
current-device-era-only value list, and one line stating there is no band
yet and roughly when one becomes possible — §8.1's original "vs *his*
band" wording is deferred, not abandoned. "Today's session" reads
`sessions` for the date. "Flag" evaluates three rules in order (shin,
illness, a rolling-7-day volume ramp) and is absent entirely, not empty,
when none qualify. `compute/build_data.py` gained `build_today()`,
writing `web/public/data/today.json`. See the v1.26 amendment below.
**v1.26's Flag rule 3 shipped without a tracking-break guard and was
found live rendering an inflated ramp number — fixed, rule 3 is now
suppressed (not caveated) whenever either 7-day window it compares
touches a pre-8-Aug-2026 date, falling through to `None` exactly as if
the rule hadn't matched.** See the v1.27 amendment below.
**§8.2's "Generate check-in" is now built — the Week page's terminating
action (§3.3), replacing its empty shell.** A lightweight-Markdown
paste-ready block: week label/dates, volume vs planned, ramp %, session
compliance Mon–Sun, and a wellness summary (means with night counts,
shin max with coverage), no composite and no verdict (§3.1). The same
pre-FR70 tracking-break hazard v1.27 suppressed in `today_flag` gets a
caveat line here instead, deliberately — see the v1.28 amendment below
for why the two panels take different fixes for the same hazard. The
other six §8.2 panels remain `EmptyPanel`s.
**§8.1 Panel 1's value list is now three sparklines** — sleep total, RHR,
HRV overnight, hand-rolled inline SVG, no charting library. Each states
its own min/max in text beside it, a null reading breaks the line rather
than bridging it, and a metric with fewer than three non-null points
renders as text instead of a line. No trend line, slope, arrow, or
direction word anywhere on the panel (§3.1); the v1.26 no-band decision
is unchanged. See the v1.29 amendment below.
**§8.1 Panel 1 was titled "Last night" but, under `ingest/sync.py`'s
never-write-today clamp, never showed last night's data — a defect
present since v1.26, made worse by v1.29 dropping the only place the
reading's date was still visible on screen. Fixed by labelling, not by
touching the clamp**: `last_night()` gained `days_behind`, the panel now
always shows the reading's date and, past the clamp's normal one-day
lag, a plain line naming the gap, and the panel is retitled "Most recent
night." The clamp itself is deliberately unchanged going into the
four-week unattended window. See the v1.30 amendment below.
· **Date:** 14 Aug 2026

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

**Amendments in v1.18 (10 Aug 2026)** — three more faults found on the
§8.3 panel's live view, reported by the athlete: no range selector, no
hover tooltip, and not-answered markers crowding the axis. Scope held to
§8.3's one panel, same as v1.16/v1.17 (no nav, no client router, no
Today/Week/Lab pages).

**1. §9's global range selector, built for this panel —
`7d · 30d · 90d · 6m · 1y · all`.** Architecture: `compute/build_data.py`
now emits `shin_series.json` **once**, at the widest range the selector
will ever need, and the range buttons filter that one series by date
client-side — never a second fetch, never a frontend recompute of
`rolling_7d_km`/`band`/`understated_volume`/coverage (CLAUDE.md rule 3).
**Widest emitted range: `DATA_START = 2023-05-13` (the first `activities`
row, the Strava-import backfill boundary, §6) through `today`** — "all"
has to reach back that far, so nothing shorter would serve every button.
Per-range `start` dates and `coverage_by_range` (answered/total for each
of the six windows) are computed once in `build_data.py` and shipped in
the JSON alongside the full series; the frontend reads both as-is and
filters `series` by `date >= range_start[key]`, a selection, not a
derivation. Month-based ranges (`6m`, `1y`) shift by calendar months
(`_shift_months`), clamped to `DATA_START` so a range nominally wider
than the emitted series never points before the first plotted day.
Default range on load: `90d`, unchanged from v1.17.

**2. Hover tooltip — axis-triggered, added to `shinVolumeChart.ts`.**
Shows, for the hovered day: the date, `rolling_7d_km`, and shin state —
the raw 0–3 value when answered, an explicit "not answered" when null
(§5's null rule, CLAUDE.md rule 12 — never blank, never a bare 0 standing
in for unanswered), plus an understated-volume flag on days that carry
it. Looked up by index in the same `series` array already plotted, never
recomputed. §9's "no inline annotations, ever" is a rule about the chart
itself, not about on-demand hover inspection — this does not weaken it.
**§9's tap-to-inspect detail drawer is a separate, still-deferred
feature** — it shows sessions/journal/habits, none of which exist until
Phase 2 (§8.4's join rule, §12) — recorded as an explicit open item
below so it is not later assumed shipped alongside the tooltip.

**3. Not-answered marker crowding — fixed by density, not encoding.**
The reported case: 90 days, 2 answered, 88 full-size hairline rings
shoulder-to-shoulder swamping the two real readings. §10's three-state
requirement stands unweakened — a not-answered day must still be
visibly distinct without colour — so the fix scales the *existing*
hairline-ring encoding's symbol size and opacity down as the point count
grows, floored well above invisible, rather than changing what the ring
means or dropping any of them. Full size/opacity below ~14 points (few
enough that individual rings stay legible as distinct dates); above
that, both scale by `1/sqrt(n)` against that reference, so 90 points
(the reported case) renders at roughly 40% size/opacity — a faint
dotted baseline, not 88 competing circles — and "all" (~1,100+ points)
floors out to a near-invisible baseline without disappearing. The
answered shin markers (in-band/out-of-band) are unaffected — the
complaint was specifically that the *unanswered* ring dominated, not
that answered markers were too small.

**Also: the "7-day" vs range legibility fix the task called out
separately, not a numbered fault but read as a contradiction by the
athlete.** The panel title still names the metric (`rolling_7d_km`
itself is not renamed) but a new subtitle states the two are
independent — "the line is a trailing 7-day sum ... the range below
picks how much time is shown, not the width of that sum" — and the km
axis label changes from `km` to `km (7d)` as a second, quieter cue. A
third, incidental fix fell out of widening the emitted range to
multiple years: the x-axis date formatter drops the year (`MM-DD`) only
while the plotted range stays inside one calendar year; once a range
crosses a year boundary (`6m` near a rollover, `1y`, `all`) it switches
to `YY-MM-DD`, since `MM-DD` alone repeats across different years with
nothing to disambiguate them — not part of the reported faults, but a
direct, necessary consequence of this amendment's own widened range.

**Deferred, added as open items (§13) — not improvised into this
commit, per the task:**
- §9's per-range **mean and delta vs the previous equivalent window**.
  Applies to `rolling_7d_km` only — §7 forbids any mean of `shin` — and
  needs its own precomputed values per range (mean, plus the prior
  window's mean for the delta), which `build_data.py` does not compute
  yet. Improvising it into the render layer would mean the frontend
  deriving a mean itself, a direct CLAUDE.md rule 3 violation.
- §9's **tap-to-inspect detail drawer** (day/week → sessions, journal,
  habits). Blocked on Phase 2 data that does not exist yet (§8.4, §12).

**Amendments in v1.19 (12 Aug 2026)** — Phase 2 begins: `sessions`,
`weekly`, `benchmarks` migrated into Supabase (migrations 006/007), ahead
of the 17 Aug Meso 1 boundary (§12). This commit is schema only — the
one-time Airtable port script, the `activities.session_id` backfill, the
`ingest/sync.py` lookup for new activities, the coaching-thread
instruction handoff, and dropping Airtable are separate, later steps.

**1. `sessions` has no `shin` column — correcting a factual error in
this section, not adding a new decision.** §5 previously said
`sessions.shin` and `daily.shin` would "overlap by design during the
transition" and that `sessions.shin` would be "dropped" after 17 Aug.
That was wrong on inspection: Airtable's own `Shin (0-3)` column is
empty on every `sessions` row that exists, and `daily.shin` (via `/log`)
has been the sole source since Phase 0 — there was never a real second
value to overlap with. `sessions` is created with no `shin` column at
all; nothing is being dropped later because nothing was ever there.
Recovering 20 Jul – 7 Aug 2026 shin history out of Airtable's free-text
`Actual` field into `daily` — the period logged in Airtable before
`/log` existed — is a separate, later task, not designed around here.
See the corrected `sessions` field list below.

**2. `execute_sql` authenticates as the `postgres` superuser, not
`service_role` — confirmed this session.** The coaching thread (a
separate Claude project) writes `sessions`/`weekly`/`benchmarks`
directly via the Supabase MCP `execute_sql` connector. `select
current_user, session_user` against the live project returns `postgres`
for both — this bypasses row-level security and every table grant
entirely, the same way applying a migration does. Consequence, stated
plainly: **the `phase`/`session_type`/`done` CHECK constraints
(`sessions_phase_check`, `sessions_session_type_check`,
`sessions_done_check`) are the only database-level protection against a
bad write from the coaching thread** — not a backstop behind PostgREST
grants, the role CHECKs play for every other table in this schema
(`authenticated`/`anon` cannot reach `execute_sql` at all). The
coaching thread's own instructions must state the exact allowed vocab
so this is never the first line of defense in practice.

**3. `weekly.week_start`/`week_end` are parsed from `Weekly.Dates`
text, not from a `full_plan.md` file — that file is not in this repo.**
An earlier assumption that `full_plan.md` on disk gives every week's
real dates doesn't hold: it isn't in the working tree or in git
history. It lives in the coaching project's own knowledge files, not
this repo. This isn't a blocker: every known week falls inside 2026
(Airtable logging began 20 Jul 2026; the latest benchmark dates are 23
and 26 Sep 2026), so the port parses each `Weekly.Dates` string (e.g.
`"Aug 3-9"`, `"Jul 27-Aug 2"`) directly against year 2026 and asserts
the result is a clean Monday→Sunday span — `weekly.week_start` is
`CHECK`-constrained to a Monday (`weekly_starts_monday`) and
`weekly.week_end` to exactly six days later (`weekly_mon_sun`). A row
that doesn't parse to a clean week is a hard import error, not a guess.
The self-verifying parse is the design; it does not depend on a file
this repo doesn't have.

**Amendments in v1.20 (12 Aug 2026)** — the one-time Airtable port itself
ran: `ingest/airtable_port.py`, a one-time archive-backfill script in the
same category as `strava_import.py` (reads a static JSON export dumped
from the base, never the live Airtable API — the export lives outside
this repo, same reasoning as `strava_import.py`'s CSV export, since the
free-text Note/Actual/Verdict/Current Limiter fields carry health and
personal detail). 28 `sessions`, 10 `weekly`, and 4 `benchmarks` rows
written; run twice against the live database and confirmed to leave
identical row counts both times (CLAUDE.md rule 4). The separate
`activities.session_id` backfill UPDATE then linked 35 rows; every
remaining `NULL` was confirmed to predate 20 Jul 2026, the Airtable
logging start (v1.19 amendment #3) — there is no gap inside the covered
range.

**This is a snapshot as of 12 Aug 2026, not a live sync.** Airtable
remains the authoritative, actively-written source until the Meso 1
boundary (17 Aug) cutover steps land — the coaching thread's write
target, `ingest/sync.py`'s `sessions` lookup, and dropping Airtable are
all still open (deferred by the v1.19 amendment above, untouched here).
Any Airtable row written or edited after this port's run will not appear
in Supabase until a later re-run or the cutover itself.

**Two decisions this run needed that the spec didn't already cover:**

**1. One Benchmarks row has no Date and was skipped, not ported.**
Airtable's `Bloodwork (ferritin/iron/D/B12)` row carries a `Test` name
and a `Notes` field ("Open action - book for after a rest day this
week.") but no `Date`, `Result`, or `Vs Projection` — it is an open
to-do, not a completed test event, unlike every other `benchmarks` row.
`benchmarks.date` is `not null` by deliberate migration-006 design (every
other row is a real dated test), and CLAUDE.md rule 12 forbids inventing
a placeholder date to force it in. Aborting the whole port over one
unrelated to-do row would also have blocked four real, well-formed
benchmark rows. `airtable_port.py` skips any dateless `benchmarks` row
and reports it by Airtable record id and Test name in its run summary —
an explicit, reported skip, not a silent drop. The row is untouched in
Airtable itself (this task's Airtable access was read-only throughout).

**2. `service_role` needed `INSERT`/`UPDATE` on `sessions`/`weekly`/
`benchmarks` — migration 008.** Migration 007 granted `service_role`
`SELECT` only, because the only known reader at the time was
`compute/metrics.py`. Running `airtable_port.py` under `service_role`
(the same role every other headless ingest script in this repo
authenticates as) failed with `permission denied for table sessions`
until migration 008 added `INSERT`/`UPDATE` — the identical gap class
and identical fix as migration 004 for `biometrics`/`activities`. No
`DELETE` grant: nothing in this codebase deletes rows from these three
tables. The ongoing writer stays the coaching thread's `postgres`-
superuser `execute_sql` connection (migration 006's comment); this grant
exists for `service_role`-authenticated one-time/backfill scripts.

---

**Amendments in v1.21 (12 Aug 2026)** — the 20 Jul – 7 Aug 2026 `daily.shin`
recovery flagged as deferred by the v1.19 amendment (#1, above) has now run,
partially. `sessions.actual`'s free text for that window was reviewed by the
athlete for any day-specific shin number; four `daily` rows were inserted (no
existing row for any of these dates, so this is a plain insert, not an
upsert-over-real-data case — CLAUDE.md rule 4's upsert-on-date form was still
used, in case of a future re-run):

| Date | `shin` |
|---|---|
| 2026-07-22 | 1 |
| 2026-08-04 | 0 |
| 2026-08-05 | 0 |
| 2026-08-06 | 0 |

**The governing rule: a shin value is recovered only where `sessions.actual`
states a number for that specific day.** Prose describing a state or a trend
without a number attached to a single date is not a reading, however
unambiguous it reads to a human. This is the same reasoning as CLAUDE.md rule
12 (a nullable field is never coerced to a default) applied one layer
upstream, at extraction time rather than compute time: "cleared" or "have
held at 0" describes a state, not a measurement of a specific day, and
turning it into a number would be exactly the kind of improvised assessment
§5's null rule exists to prevent.

**Three spans in the same window were reviewed and rejected by the athlete,
and stay `NULL` by decision — not oversight, and not to be revisited by a
future pass over the same `sessions` text:**
- **2026-07-23** — `sessions.actual` says "cleared," describing a state, not
  a same-day number.
- **2026-08-07** — `sessions.actual` says "have held at 0," describing a
  streak's continuation, not a discrete reading for that date.
- **2026-07-31, 2026-08-01, 2026-08-02** — covered only by a retrospective
  "all clean" note spanning multiple days, with no per-day number to attribute
  to any one of the three dates individually.

The remaining dates in the 20 Jul – 7 Aug 2026 window that this pass did not
even consider — every day `sessions.actual` doesn't mention shin at all —
stay `NULL` for the ordinary reason: never answered, §5's null rule.

---

**Amendments in v1.22 (12 Aug 2026)** — two corrections found by auditing the
§8.3 panel against the four `daily.shin` rows the v1.21 amendment inserted.

**1. The pre-8-Aug-2026 understated-volume treatment is now full-plot-height,
covering both series — binding, supersedes v1.16 on this point.** v1.16 built
the v1.7 hatch as a fill under the `rolling_7d_km` line's own value, on the
km axis only, because at the time no `daily.shin` row existed before 8 Aug
2026 — there was nothing for the fill's height to fail to cover. v1.21
changed that: it inserted real pre-FR70 `shin` readings at 2026-07-22,
2026-08-04, 2026-08-05, and 2026-08-06, all inside the understated window. A
fill confined to the km line's own height does not reliably reach a shin
marker plotted on the chart's separate 0–3 axis — the two axes share the
same pixel grid but not the same value range, so a shin marker can sit above
the top of the km fill and read as if it carries no understated-volume
warning at all. That is the exact misread v1.7's binding requirement exists
to prevent, now realised on real data rather than hypothetically. **Fix:** the
hatch renders as an ECharts `markArea` on the shared grid — an x-only range
per contiguous run of `understated_volume = true` (still read day-by-day off
`shin_series.json`, never a hardcoded date, per v1.16's original reasoning)
with no y bound, so it spans the full plot height — sitting behind both the
`rolling_7d_km` line and the shin marker/step series (lowest z of any series
on the chart) rather than under one line's own value. Same hatch texture,
same legend entry, same silence toward tooltip/interaction as before — only
the region's shape and z-position changed.

**Implementation note, correcting v1.22's original text above, which was
wrong and is superseded by this paragraph.** v1.22 originally claimed a
general ECharts rendering quirk: that a markArea on a category axis only
resolves its `xAxis` date bounds correctly via a second, separate
`setOption` call made after the chart's axes already exist, and that
`ShinVolumePanel.tsx` needed to strip `markArea` off the host series
before the first call and merge it back in with a second call
immediately after. That was never tested in isolation — during the same
session, the host series' `data` went through three states (`[]`, then
`series.map(() => null)`, then the real `kmData` it ships with today) and
the two-call split was carried forward past the point where it stopped
being necessary. The actual cause: an ECharts series with no non-null
data points is never given a `coordinateSystem`, and a markArea attached
to such a series has nothing to resolve its `xAxis` bounds against, so
the bounds are silently dropped and the region renders across the full
axis instead of the given date range, with no error and no console
warning. That only applied while the host series carried `[]` or an
all-null array. Once it carries `kmData` — real, non-null values, as it
does in the committed panel — the markArea resolves correctly in a
single `setOption` call; this was verified against a live render at both
the 90d and `all` ranges (pixel-sampled the canvas directly: the hatch's
alpha channel drops to zero exactly at the `understated_volume` boundary
and nowhere else). `ShinVolumePanel.tsx` applies the full option,
`markArea` included, in one `setOption` call. There is no second call and
no rendering-time caveat left to document.

**The three shin marker states (§10) are deliberately untouched by this
fix, and must stay that way.** §10 defines exactly three states for `shin` —
solid (in band), hollow (out of band), absent (not answered) — and is
explicit that a not-answered day must never look like a day with no pain.
Restyling, tinting, or adding a fourth state to markers that happen to fall
in the understated-volume window would encode the same "floor, not
measurement" information twice, in two different visual systems, on the
same three points that already carry it once via the background region —
and would risk exactly the ambiguity §10 was written to rule out (does a
tinted marker mean "out of band" or "understated period"?). The background
region carries the understated-volume signal; the marker continues to carry
only in-band/out-of-band/not-answered, nothing else, at every date.

**2. §13's open question 4 (pre-FR70 volume metrics reading from
`sessions`/`weekly` instead of `activities`) is unaffected by this fix and
stays open.** This amendment only changes how the existing
`understated_volume` flag is rendered, not what produces it or what
`rolling_7d_km` is computed from.

**3. Correction to v1.21's three rejected spans (2026-07-23, 2026-08-07,
2026-07-31/08-01/08-02): the rejection is scoped to that specific review
pass, not a permanent bar on those dates.** v1.21 rejected them because the
`sessions.actual` text available at the time described a state or a
multi-day span, not a same-day number (§5's null rule applied at extraction
time). That is a statement about that text, not about the dates themselves —
it does not mean those three dates may never hold a `shin` value. A future
pass that re-reads the same `sessions.actual` text and reaches a different
conclusion is out of scope and not authorised by this correction; the
review of that specific text is closed. But a per-day `shin` number arriving
from any other source — most directly, the athlete entering it for one of
those dates via `/log` (§8.5) — is a normal `upsert`-on-date write like any
other `/log` entry, and is not blocked by v1.21 or by this amendment. Those
three rows stay `NULL` today for the ordinary reason (never answered),
exactly like every other unlogged day in the window, not for a special
one.

**Amendments in v1.23 (13 Aug 2026)** — v1.22's implementation note was
tested and found wrong; correction only, no rendering or behaviour
change.

**1. The two-`setOption` workaround in `ShinVolumePanel.tsx` is removed;
the panel applies its full option, `markArea` included, in a single
`setOption` call.** v1.22's claim of a general ECharts quirk — that a
markArea on a category axis needs a second, separate `setOption` call to
resolve its `xAxis` bounds — was never isolated from the other change
made in the same session (switching the host series' `data` from an
empty/all-null array to real `kmData`) and was never re-tested after that
switch landed. Isolating it now: with the host series carrying `kmData`,
a single `setOption` call resolves the markArea's bounds correctly.
Verified against a live render at the 90d and `all` ranges by
pixel-sampling the rendered canvas directly (not just reading the option
object) — the hatch's alpha channel is uniform across the
`understated_volume = true` span and drops to zero exactly at the
`understated_volume = false` boundary, both times. See the corrected
implementation note under v1.22 above, which replaces the original
(wrong) one in place rather than being restated here.

**2. No panel behaviour, marker encoding, or region-bounds logic
changed.** This amendment corrects a claim about ECharts' rendering
behaviour and the code written to work around it; `shinVolumeChart.ts`'s
option builder, `understatedVolumeRegions()`, and the three shin marker
states (§10) are untouched.

**Amendments in v1.24 (13 Aug 2026)** — `ingest/sync.py` gains a
`sessions` lookup, closing the gap where every activity synced since
8 Aug 2026 (the ongoing scheduled job, distinct from the v1.20 one-time
Airtable backfill) landed with `session_id` `NULL`. Full detail lives in
§5 under `activities`, next to the constraint it depends on; summarised
here per the roadmap's Phase 2 sync requirement (§12).

**1. Link-on-write plus a self-healing repair pass, both matching the
v1.20 backfill's own rule — every activity type on a date links to that
date's one `sessions` row, never running-only.** `sync.py` fetches the
full `id, date` map from `sessions` once per run and sets `session_id`
on each activity it upserts, by date match. After the normal sync
completes, a repair pass selects every `activities` row with
`session_id IS NULL` across all dates (not just the run's window) and
applies the same match — this closes the hole opened by the 17 Aug
check-in cadence, where `sessions` rows are written a week at a time and
an activity can be ingested before its own week's row exists. See §5
for the full mechanism, including why the upsert never overwrites an
existing non-null `session_id` with `NULL`.

**2. Correction, per the v1.22/v1.23 precedent of marking a wrong claim
as wrong rather than quietly rewording it: the work order that
specified this amendment asserted "nothing enforces one row per
`sessions` row per date at the schema level."** That was wrong.
`sessions_date_key` (`UNIQUE (date)`, migration 006, v1.19) already
enforces it, and this spec's own §5 description of `sessions` has said
"`date` (unique)" since v1.19 — no spec text needed correcting, only the
premise of the work order, caught before it reached the spec. The
constraint is kept deliberately: live data shows a double training day
is already represented as multiple `activities` rows under one
`sessions` row (2026-07-21: two `running` plus one `other`, all linked
to a single `Strength A` session), not as two `sessions` rows on one
date, so the constraint forbids nothing the training plan needs; and
after the 17 Aug cutover, the coaching thread writes `sessions` directly
via `execute_sql`, which runs as the Postgres superuser and bypasses RLS
and every grant in migrations 007/008 — the constraint is a fourth
database-level guard on that path, alongside the three `CHECK`
constraints already on `phase`/`session_type`/`done`. `sync.py`'s
map-builder still logs a warning and drops any date it finds repeated
in `sessions`, but that is now documented as a tripwire against
`sessions_date_key` being dropped later, not as live-data handling.

---

**Amendments in v1.25 (13 Aug 2026)** — the dashboard's first navigation
shell. Before this commit the index route rendered only the §8.3 shin
panel with no way to reach anything else, and `/log/` was reachable only
by typing its URL. This commit adds a persistent nav (Today · Week ·
Block · Log), moves the §8.3 panel under Block unchanged, and ships
Today/Week as empty panel shells. Three items, per CLAUDE.md rule 13.

**1. Navigation is tabs backed by React state, not the §4/v1.9 client
router — binding, supersedes the router plan for now.** §4's v1.9
amendment planned a single bundle with a client-side router once Week
and Block existed to route to; v1.10 deferred only the bundle merge,
leaving the router itself as the assumed mechanism once that day came.
That day is this commit, and the router is not what got built. A client
router needs the host to serve `index.html` for any unrecognised path —
`/week`, `/block`, a stale bookmark, a typo — so the browser's own
navigation reaches the app instead of the host's static-file 404.
Getting that host rewrite rule right, and keeping it right through a
future host or config change, is exactly the kind of thing that is easy
to get wrong once and silently break: a deploy that regresses it doesn't
error, it just serves a 404 on refresh or on every deep link, and the
frontend's own tests can't catch a host-level routing rule. This project
runs unmaintained for four-week windows (§1's premise for the athlete's
role, unchanged) with no one available to notice or fix a bad deploy
until the athlete happens to hit it. Tabs backed by `useState` in
`App.tsx` carry no such failure mode — there is exactly one URL
(`/`), the browser never routes, and a broken tab is a broken render,
caught the same way any other React bug is caught. The cost, accepted
explicitly: no deep-linking to a tab and no state restore on refresh —
refreshing on Week silently lands back on Today, same as before this
commit. **This does not retire the router as an idea.** It supersedes it
*for now*, for the reason above; a client router remains a legitimate
later change, once someone is actually available to notice and fix a
bad deploy if the host rewrite rule is ever wrong — plausibly whenever
Lab (§8.4, Phase 5) adds a fourth real page and deep-linking starts
costing something to not have. §4's architecture diagram is updated
above to say so, in place, rather than leaving the old router-first
framing to mislead a future reader.

**2. The two build entries stay separate, and the publishable key stays
out of the dashboard entry — restated, not changed.** v1.9's reasoning
for eventually merging the two entries was never about tab navigation
existing — it was that Cloudflare Access (§2 decision 3) leaves no
anonymous visitor to keep the write path away from (§4, §11 rule 5).
That reasoning is unchanged by this commit. What *does* change is that
the dashboard now, for the first time, renders a nav link that points at
`/log/` — a future reader skimming the nav code could reasonably assume
the two entries have therefore become one. They have not: `Nav`'s Log
item is a plain `<a href="/log/">`, causing a full page load into the
separate `web/log/index.html` bundle, exactly as typing the URL always
did (§8.5). `App.tsx` and everything it imports (`Today`, `Week`,
`Block`, `EmptyPanel`, `ShinVolumePanel`) still must never import
`@supabase/supabase-js` or anything under `src/log/` — restated in
`App.tsx`'s own top comment, not only here, since that is the file a
future edit is most likely to touch first. The publishable key ships in
`web/log/index.html` only, unchanged since v1.9/v1.10 (§11 rule 5).

**3. Today and Week ship as empty shells — deliberately, not a stopgap
someone forgot to fill in.** Each panel titled per §8.1/§8.2 renders
literal text reading "Not built yet" (`panels/EmptyPanel.tsx`) rather
than any sample series, placeholder number, or lorem text. This is the
same discipline CLAUDE.md's Hard Rule 3 states for shipped panels —
every number on screen must be traceable to a tested function — applied
to the case of no function existing yet: the honest empty state is the
absence of a number, never a fake one standing in for it. It matters
more here than it would on a maintained dashboard, per the same
four-week-unmaintained-window reasoning as item 1 above — a fake number
during that window has nobody around to correct it, and this codebase's
whole premise (§1) is that every number the athlete sees is a real
measurement. Each `EmptyPanel` is a stand-in for one future real panel
component, replaced one at a time as §8.1/§8.2 are actually built; the
component itself must not grow props or variants to do more than render
a title and the fixed empty-state text.

**Amendments in v1.26 (13 Aug 2026)** — §8.1 Today built for real,
replacing its three `EmptyPanel`s. Three items, per CLAUDE.md rule 13.

**1. Panel 1 ("Last night") ships with no reference band — binding,
a departure from §8.1's original "vs *his* band" wording, deferred
rather than abandoned.** The only baselines that exist anywhere in this
codebase (`rhr_baseline`, `hrv_baseline`, §7) were recorded on the
Amazfit, and CLAUDE.md rule 5 / decision 11 forbid any baseline from
spanning the Amazfit/FR70 device break — `biometrics.device` has been
`'fr70'` only since 8 Aug 2026 (§5), so there is currently no FR70-era
history long enough to compute one, and Garmin's own HRV Status
similarly reports the literal string `"NONE"` until roughly 21 nights
have accumulated on a device (§7 `hrv_baseline`'s `HRV_BASELINE_MIN_DAYS`
constant). Inventing a band from the handful of FR70 nights available
today, or reusing the Amazfit numbers as a stand-in, would both violate
CLAUDE.md's "if the build needs a decision the spec doesn't contain,
stop and ask" — no such decision was ever made, and a plausible-looking
band here is exactly the kind of silent contradiction that rule exists
to prevent on a chart nobody may be watching for weeks at a time (§1).

So Panel 1 renders three raw values (sleep total, RHR, HRV overnight)
for the most recent `biometrics` row, a value list of every night on the
*current* device only (reusing `_rows_on_current_device`, the same
device-break filter `rhr_baseline`/`hrv_baseline` already use — CLAUDE.md
rule 5), and one line, stated once for the panel and not per metric,
saying there is no reference band yet, that the Amazfit baselines don't
carry over, and the approximate date a band becomes possible. That date
is computed, not hand-picked: `first_date_on_current_device +
(HRV_BASELINE_MIN_DAYS − 1)` days — the same elapsed-day convention
`hrv_baseline` already uses for its own `days_elapsed` gate, applied here
to project forward rather than gate a render. The panel's own copy never
states or implies the old Amazfit numbers. **This panel is expected to
gain a real band once enough FR70 nights exist** — into `rhr_baseline` /
`hrv_baseline` themselves, at which point this deferred state is retired,
not extended.

New `compute/metrics.py` function: `last_night(biometrics, as_of)` →
`{date, sleep_total_min, rhr, hrv_overnight, device, device_since,
values, band_possible_from}` or `InsufficientData` if no biometrics rows
exist at all. `values` is every row on the current device up to and
including `as_of`, each `{date, sleep_total_min, rhr, hrv_overnight}` —
a NULL sensor reading stays NULL (CLAUDE.md rule 12), never zero-filled.

**2. Panel 2 ("Today's session") reads `sessions` for the exact date,
narrowed to four fields — session_type, purpose, prescription, done.**
No row for today is a real, expected state (a rest day, a gap before the
next Airtable-ported block) and renders as plain text saying so, not an
empty panel or an error. New function: `session_for_date(sessions,
target)` → the matching row's four fields, or `None`. `sessions.date` is
unique (migration 006, v1.19), so at most one match is possible by
construction.

**3. Panel 3 ("Flag") — at most one, evaluated in this fixed order,
stopping at the first hit; absent entirely (not an empty or
"nothing to report" card) when none qualify.**

   a. `daily.shin > 0` on today or yesterday, today checked first.
      `NULL` is never a hit — NULL means *not answered*, never "fine"
      (§5's null rule, CLAUDE.md rule 12); this is exercised directly by
      a test (`test_today_flag_null_shin_never_triggers`).
   b. `daily.illness is True` on today or yesterday, today checked
      first. `NULL`/`False` are not hits.
   c. A completed rolling 7-day km total more than 10% above the
      preceding completed 7-day total. **"Completed" is binding: the
      current window ends *yesterday*, never today** — today is still in
      progress, and including its (possibly partial, possibly
      not-yet-synced) distance would be a projection dressed up as a
      measurement, which this rule must never produce. Reuses the
      already-tested `rolling_7d_km`/`ramp_pct` (§7) rather than
      reimplementing the ratio, but **this is a distinct metric from
      §7's `ramp_pct`**: that one compares calendar Mon–Sun weeks via
      `weekly_km` (§8.2's Week page), this compares two trailing 7-day
      windows via `rolling_7d_km`, per this panel's own rule as stated
      above — the two must not be confused or unified, they answer
      different questions ("did the week happen" vs. "is today's
      rolling load elevated"). The 10% threshold is the same tolerance
      as `ramp_pct`'s reference band, held in a new constant,
      `TODAY_FLAG_VOLUME_RAMP_PCT`, not shared code — coincidence of
      value, not of meaning. "More than 10%" is strict (`>`, not `≥`).

   New function: `today_flag(activities, daily, today)` → one of
   `{"kind": "shin", "date", "shin"}`, `{"kind": "illness", "date"}`,
   `{"kind": "volume_ramp", "window_end", "current_7d_km",
   "prev_7d_km", "pct"}`, or `None`.

**Data path, restated per CLAUDE.md rule 3:** all three panels read one
new build artifact, `web/public/data/today.json`
(`compute/build_data.py`'s `build_today()`), fetched once by `Today.tsx`
and passed down as props — not three separate fetches, since all three
panels load together on the athlete's daily ten-second check (§8.1). The
frontend (`LastNightPanel`, `TodaySessionPanel`, `FlagPanel`,
`panels/today.ts`, `panels/lastNightCopy.ts`, `panels/flagCopy.ts`)
formats and selects only; every value, every date, and which flag rule
fired were decided in `compute/metrics.py`.

---

**Amendments in v1.27 (14 Aug 2026)** — v1.26's Flag rule 3 was specified
and shipped without a tracking-break guard. That was wrong, not a
missing nice-to-have: it shipped a number that overstated the volume
ramp by an unknown amount on the default landing page, marked as a
`today_flag`.

**The defect, stated plainly.** Rule 3 compares two trailing 7-day
`rolling_7d_km` windows. Nothing in it checked whether either window
fell before 2026-08-08, the FR70 cutover — despite §7's own binding note
(the v1.7 amendment) that `rolling_7d_km` for any range ending before
that date is a floor on true volume, never a measurement, because of the
unreliable pre-FR70 phone/Zepp tracking. Live on 14 Aug 2026 this
reported a ramp of +37% (40.7 km vs 29.8 km) where the comparison window
(2026-07-30..2026-08-05) was entirely pre-break and the current window
(2026-08-06..2026-08-12) included two pre-break days. The true ramp
against fully-tracked volume is unknown — it could be larger, smaller,
or not a ramp at all — and v1.26 rendered it as a plain percentage on
the one panel a single unattended reader checks daily. Both windows stay
contaminated until 2026-08-22 (the first day the earlier of the two
windows clears 2026-08-08 entirely), so this was not a transient glitch
that would have resolved itself within the coming week.

**The fix — suppression, not a caveat, binding.** Rule 3 does not fire
at all if either 7-day window contains any date before 2026-08-08.
Suppressed, the rule is treated as a non-match: evaluation falls through
exactly as if rule 3 had not fired, so `today_flag` returns `None` when
rules 1 and 2 also miss, and §8.1's Flag slot is absent entirely — not
present with a warning, asterisk, or "provisional" label attached. A
caveated number was considered and rejected: this dashboard runs
unattended for weeks between checks by a single reader (§1, §3), and a
flag that has to be mentally discounted every time it's seen trains that
reader to discount flags in general, which devalues shin and illness
flags — the two that are never data-quality-compromised — right along
with it. Absence is legible without context; a footnoted number is not.

**Boundary reuses `UNDERSTATED_VOLUME_CUTOFF`, the existing constant —
no second hardcoded date.** `compute/metrics.py` already defines this
constant (§7/§8.3, v1.7/v1.16) and `shin_series` already reads it
day-by-day to derive `understated_volume`, per v1.16's binding
"read from data/one source of truth" precedent. `today_flag` imports and
compares against that same module-level constant directly — it did not
need a second lookup path or a value threaded in from elsewhere, so
nothing was added to the constant itself. The two 7-day windows rule 3
compares are contiguous (the "current" window ends yesterday, the "prev"
window ends 7 days before that), so checking only the prev window's
start date against the cutoff is sufficient to catch a date anywhere in
either window — no separate check is needed for the current window.

**This rule can begin firing again on 2026-08-22.** Suppression clears
the first day the prev window's start date is no longer before
2026-08-08. For `today = 2026-08-22`: prev window 2026-08-08..2026-08-14,
current window 2026-08-15..2026-08-21 — both fully post-break. No code
change is needed on that date — the guard clears itself as real dates
accumulate past the cutoff, same as `shin_series`'s existing hatch does.

**No other rule changed.** Rules 1 (shin) and 2 (illness) have no
tracking-break dependency and are untouched. §7's `today_flag` table row
and §8.1's Panel 3 description below are updated to state the guard;
`ramp_pct`'s own §7 row and the Week page (§8.2) are untouched — this
amendment is scoped to `today_flag` rule 3 only.

---

**Amendments in v1.28 (14 Aug 2026)** — §8.2's "Generate check-in" panel
built, replacing its empty shell. The other six §8.2 panels stay
`EmptyPanel`s, unchanged. Two items.

**1. §13 open question 3 confirmed, not superseded — a wrong premise in
the work order that specified this commit, caught before it reached the
spec.** That work order stated the block should be plain text, no
markdown, framing the choice as one the spec didn't already make. It
does: §13 item 3 already recorded "v1: Markdown." The work order's
plain-text framing rested on a specific, checkable mistake — it assumed
a paste destination that renders literal asterisks and hashes as noise.
The actual destination is a Claude conversation, which renders Markdown,
so the same syntax is structure the reader benefits from. Caught and
corrected before implementation, same precedent as v1.22/v1.23/v1.24: a
wrong claim is marked wrong here, not quietly reworded. §13 item 3 is
closed as **confirmed**, not moved out of the list — this amendment
record is the more useful place for anyone re-deriving why to look.

§13's original answer said only "Markdown," not how much. Scope decided
in this same correction: lightweight only — one heading line, plain
paragraphs, bullet lists, bold reserved for field labels, no tables (read
on a phone before pasting), no emoji. Full six-piece contents recorded in
§8.2 above, not repeated here.

**2. The tracking-break hazard `today_flag` rule 3 hit in v1.27 applies
here too, and gets a different fix, deliberately.** Both `weekly_km`/
`ramp_pct` (§7) and this block's ramp line sum `activities.distance_km`
over a range that can include pre-8-Aug-2026 Strava/Zepp-tracked days —
the same confirmed, uneven undercount v1.7 documented and v1.27
suppressed `today_flag` rule 3 over. This block does not suppress: it
renders `actual_km`/`planned_km`/`ramp_pct` unconditionally and adds one
caveat line when the selected week or its comparison week touches a
pre-cutoff date, stating the affected figures are a floor and the ramp
isn't a reliable comparison.

The two panels differ in exactly the property v1.27's own reasoning
turned on. `today_flag` is read unattended, with no surrounding context,
for weeks at a time — a caveated number there teaches the one reader to
mentally discount flags in general, including shin and illness, which
are never data-quality-compromised. This block is read by Luca, with
context, in the seconds before he sends it to a human coach who can ask
a follow-up if a number looks off; removing the actual-km figure entirely
would remove information the coach needs regardless of its precision.
Same constant, `UNDERSTATED_VOLUME_CUTOFF` (§7/§8.3, v1.7/v1.16/v1.27) —
no second hardcoded date — different render decision for a different
reader.

New `compute/metrics.py` function: `week_checkin(activities, daily,
biometrics, sessions, weekly, today)` → the full check-in dict —
`week_start`/`week_end`; `week_label`/`dates_label` from the matching
`weekly` row, both `None` together if none exists; `actual_km`/
`planned_km`/`prev_actual_km`/`ramp_pct` (reusing `weekly_km`/`ramp_pct`
from §7 as-is, not reimplemented); `sessions`, 7 entries, Monday first,
each `{date, session_type, done}` with both fields `None` when no
`sessions` row exists for that date; `wellness`, with `sleep_mean_min`/
`rhr_mean`/`hrv_mean` each paired with its own `_n` night count plus
`shin_max` over answered days only and `shin_answered`; and
`understated_volume`/`understated_volume_cutoff`. `compute/build_data.py`
gained `build_week()`, writing `web/public/data/week.json`, scoped to
the two weeks the ramp needs rather than fetching whole tables.
`Week.tsx` fetches it and renders `CheckinPanel`; `web/src/panels/
checkinCopy.ts` formats the dict into the Markdown block above and
`web/src/panels/week.ts` mirrors the JSON contract — the same
type/copy/render/build-step division v1.26 established for §8.1.

---

**Amendments in v1.29 (14 Aug 2026)** — §8.1 Panel 1's value list (v1.26)
replaced with three sparklines, one each for sleep total, RHR, and HRV
overnight, so the shape of the current-device era is visible at a glance
instead of a list of rows the reader has to scan by eye. No `compute/
metrics.py` change: `last_night.values` (v1.26) already carried every
field needed, already scoped to the current device only, already
preserving a null sensor reading as `null` rather than coercing it to
zero (CLAUDE.md rule 12). This is a render-layer change only.

**1. Each sparkline states its own min and max as text beside it, with
units — binding, not decoration.** A sparkline auto-scaled to its own
box makes any spread, however small, fill the full height of the chart;
a 3 bpm RHR range and a 30 bpm range draw identically tall without the
numbers alongside them, and the shape is unreadable, actively
misleading, without that scale in view. `web/src/panels/lastNightCopy.ts`
gained `formatMinutesRange`/`formatUnitRange`, stating the unit once, at
the end, matching `formatMinutes`/`formatUnit`'s existing convention.

**2. No trend line, slope, arrow, direction word, or colour-by-direction
— binding, ties directly to §3.1.** The panel draws the recorded shape
and nothing else. A week or so of nights on a brand-new device (§8.1
v1.26: the FR70 has been worn since 8 Aug) is not a sample a trend claim
can stand on, and §3.1 already forbids self-level judgement anywhere in
this dashboard — "is this line going up or down" is exactly the kind of
feedback Kluger & DeNisi found net-negative when aimed at the self
rather than the task. This is the same reasoning v1.26 gave for shipping
Panel 1 with no reference band at all, applied to the new sparklines: an
un-earned claim about direction is worse than no claim.

**3. The v1.26 no-band decision is unchanged by this amendment.** The
sparklines are an unscaled shape, not a lane (§10) — no shaded channel,
no target, nothing to fall in or out of. Panel 1 still states once, in
its existing note, that no band exists yet and roughly when one becomes
possible; that note's wording and its binding status are untouched here.

**4. Missing nights are gaps, not zeros and not interpolated points —
binding, CLAUDE.md rule 12 applied to a line chart specifically.** A
null sensor reading breaks the polyline rather than pulling it to the
floor or drawing a straight bridge across the missing night, which would
misrepresent a gap in data as a real, if extreme, reading. Implemented
as `sparklineSegments` in the new `web/src/panels/sparkline.ts`: each
contiguous run of non-null values becomes its own `<polyline>`, so a
null renders as visible empty space between segments.

**5. Fewer than three non-null points renders as text, not a line —
binding.** Two points drawn as a line is a slope, and a slope is a
trend claim rule 2 above already forbids; there is no way to draw a
two-point line that doesn't imply direction. `hasEnoughPointsForLine`
(same file) gates this per metric independently — Sleep can render as a
line while RHR, with fewer non-null nights, falls back to a plain
comma-separated value list, dated, in the same row.

**Implementation.** Hand-rolled inline SVG — `web/src/panels/
sparkline.ts` (`sparklineExtent`, `sparklineSegments`,
`hasEnoughPointsForLine`, `sparklinePoints`, all pure and unit-tested,
including the null/gap and fewer-than-three-points cases) plus a small
`Sparkline` component local to `LastNightPanel.tsx`. **No ECharts
import** — Today stays off the charting library the Block page already
loads, since Today is the daily-use landing tab and bundle weight there
matters most (§4). Three stacked rows (label, current value, sparkline
or fallback text, min/max), phone-first, matching §9's existing panel
conventions. Colour carries no information here — a single `--azzurro`
line per chart, readable in grayscale, per §10's "the line carries the
information, hue carries none of it."

---

**Amendments in v1.30 (14 Aug 2026)** — §8.1 Panel 1, titled "Last
night," was showing the most recent `biometrics` row, which is not last
night's data. **This is a defect, not a naming preference.** Verified
against the live database while writing this amendment: today's date is
2026-08-14, the newest `biometrics` row is dated 2026-08-13 —
`days_behind = 1`, confirmed as the normal steady state, not an outage.

**1. Root cause: `ingest/sync.py`'s never-write-today clamp, interacting
with §5's wake-date filing rule.** Per §5, a `biometrics` row is
correctly dated by the *wake* morning of the night it describes — the
night of D−1→D is row-dated D, not D−1. That dating alone introduces no
lag; the row already identifies the right night. The lag comes entirely
from the clamp: `--to` is never today or later, clamping to yesterday
(sync.py's own docstring: "today's steps/stress/body-battery are mid-day
values; a row written now would stay permanently half-recorded"). So the
row dated D — the night that ends *this* morning, on a naive read of
"last night" — is not written until a run whose `--to` reaches D, which
is the run on day D+1 at the earliest, never the run on day D itself.
Checking the panel the morning after (D+1), the newest row available is
therefore dated D, one full calendar day behind: `days_behind = 1` on a
healthy daily cadence, and it only grows if a run is missed. **The title
"Last night" has been inaccurate since it shipped in v1.26** — the clamp
existed then too; this amendment did not introduce the lag, it corrects
a title that was wrong from the start.

**2. v1.29 made the inaccuracy worse — a real regression, not just a
missed opportunity.** v1.26's Panel 1 was a dated value-list table: every
row, including the current one, carried its own date on screen, so a
reader who looked could see how old the number was even though the
panel's title said otherwise. v1.29 replaced that table with three
sparklines that draw no axis and print no date, falling back to a dated
plain-text list only below three non-null points (binding rule 5) — not
the common case once the FR70 accumulates nights. Once three or more
nights exist, v1.29 left the panel with **no date visible anywhere**,
strictly worse than v1.26 for judging whether the number on screen is
current.

**3. Fix: label the reading, don't touch the pipeline — binding.**
`compute/metrics.py`'s `last_night()` gained `days_behind`
(`as_of - <latest row's date>`, hand-checked in
`compute/tests/test_today.py`) — computed here, not derived in the
frontend, per CLAUDE.md rule 3. `LastNightPanel.tsx` now renders the
reading's date next to the values, formatted with the existing
`formatShortDate` "MM-DD" convention (§10), on every render, regardless
of `days_behind`. When `days_behind` is more than 1,
`lastNightCopy.ts`'s new `stalenessNote` adds one short factual line in
the same place naming the gap (e.g. "3 days behind today.") — no alarm
language, no adjective, same register as the panel's existing `noBandNote`.
At the expected `days_behind = 1`, `stalenessNote` renders nothing,
since a one-day lag under the clamp is not itself news. **The panel is
retitled "Most recent night"** — accurate to what it actually shows,
where "Last night" was not.

**4. The never-write-today clamp is unchanged — a deliberate decision,
not an oversight.** The clamp is correct: writing a mid-day row would
permanently half-record steps/stress/body-battery for that date, a worse
defect than a one-day-old reading. This repo is entering a four-week
unattended window starting today (`RUNBOOK.md`), and the ingest pipeline
that has to run unattended for four weeks is not touched on the last
commit before that window — the fix stays entirely in the render layer,
as instructed.

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
| 12 | Migration timing: `daily` now, `sessions`/`weekly`/`benchmarks` **schema** on 12 Aug (v1.19) and the **data port itself** also on 12 Aug (v1.20, both ahead of schedule — a snapshot, not the cutover), **Airtable cutover** (coaching-thread handoff, `sync.py` lookup, dropping Airtable) still at the **Meso 1 boundary (17 Aug)** | Never split a live mesocycle across two systems — Airtable stays the authoritative, live-written source until the cutover steps land; the 12 Aug port is a verified one-time snapshot that will go stale until then, not a switch of authority. |

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
│  nav = state-backed tabs, not a router (v1.25) —        │
│  merge to single bundle still deferred to Phase 2       │
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

**`session_id` has a foreign-key constraint as of migration 006 (v1.19,
12 Aug 2026)** — `activities_session_id_fkey`, referencing `sessions(id)`.
Deferred since the 002 migration, which created the column so `activities`
could be joined once `sessions` landed. The join itself is by date,
many-to-one: `activities` carries no time-of-day/ordering column beyond
Garmin's opaque numeric `id`, so same-day activities cannot be
individually disambiguated and all link to that day's one `sessions` row.
A date with no matching `sessions` row leaves `session_id` `NULL` — not
an error, the column is nullable for exactly that case. Population is now
done on both paths: the one-time backfill (v1.20, 35 rows) and the
ongoing `ingest/sync.py` lookup for new activities (v1.24, below).

**`ingest/sync.py` link-on-write and repair pass — added v1.24, 13 Aug
2026.** Every activity synced from 8 Aug 2026 onward had no lookup at
all until this amendment — `session_id` landed `NULL` on every row
written by the scheduled job, starting with the 2026-08-12 "Easy Run"
activity, because the ingest path had no `sessions` join. Fixed on two
paths, both matching the v1.20 backfill's own rule exactly — every
activity type on a date (`running`, `cycling`, `other` alike) links to
that date's one `sessions` row, never running-only:

1. **Link on write.** `sync.py` fetches the full `id, date` map from
   `sessions` once per run (not per activity — cheap, ~28 rows) and sets
   `session_id` on each activity upserted that run, keyed by date. The
   upsert payload omits the `session_id` key entirely when the date has
   no match, rather than setting it to `NULL` — PostgREST's upsert only
   updates columns present in the payload, so an existing non-null
   `session_id` is never clobbered by a later run that fails to find a
   match (CLAUDE.md rule 4: upserts, never a destructive overwrite).
2. **Repair pass, every run, after the write.** From 17 Aug 2026 onward
   `sessions` rows are written one week at a time at each Sunday
   check-in (§12), so an activity can be ingested days before its
   `sessions` row exists — link-on-write alone would leave that row
   `NULL` permanently once the sync window moves past it. So every run
   also selects every `activities` row with `session_id IS NULL`, across
   all dates (cheap — a few hundred rows, mostly pre-Airtable history
   that will never link), and applies the same date match. This is a
   plain `UPDATE` of `session_id` only; no other column is touched.

Ambiguity (more than one `sessions` row on a date) is handled in the
map-builder itself: a repeated date logs a warning naming the date and
is dropped from the map, so every activity on that date is left `NULL`
rather than guessed at. In the live schema this branch cannot currently
fire — see the correction below — so it is a tripwire against
`sessions_date_key` ever being dropped, not a path exercised by real
data today.

**Correction to an assertion made when this v1.24 work was specified:
that "nothing enforces one row per `sessions` row per date at the
schema level."** That was wrong, per the v1.22/v1.23 precedent of
marking a wrong claim as wrong rather than quietly rewording it.
`sessions_date_key` (`UNIQUE (date)`, migration 006, v1.19) already
enforces exactly that, and always has — this section's own description
of `sessions` below has said "`date` (unique)" since v1.19. No spec
text was actually wrong; the false premise lived only in the work
order that specified this amendment, caught before it was written into
the spec. Recorded here because it changed the design: the original
brief asked for a "more than one match" handling branch and a decision
to *not* add a unique constraint, on the reasoning that double
training days need two `sessions` rows. Live data contradicts that
reasoning — 2026-07-21 already has three `activities` rows (two
`running`, one `other`) linked to a single `Strength A` `sessions`
row, which is the intended model: a double day is representable as
multiple `activities` under one `sessions` row, not as two `sessions`
rows on one date. `sessions_date_key` is being kept, deliberately, for
a second reason beyond the model fit: after the 17 Aug cutover the
coaching thread writes `sessions` directly via `execute_sql`, which
authenticates as the Postgres superuser and bypasses RLS and every
grant in migrations 007/008 — the constraint is a fourth database-level
guard against a malformed write on that path, alongside the three
existing `CHECK` constraints on `phase`/`session_type`/`done`.

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

### `sessions` — the plan (schema migrated 12 Aug 2026, migration 006, v1.19)
Airtable shape retained, minus `shin`: `id` (uuid PK) · `date` (unique) ·
`week` · `phase` · `session_type` · `purpose` · `prescription` · `done` ·
`actual` · `rpe` · `note`. `phase`, `session_type`, and `done` are each
`text not null` with a named `CHECK` constraining them to the Airtable
source's exact vocabulary (`sessions_phase_check`,
`sessions_session_type_check`, `sessions_done_check`) — an unmapped value
is a hard error at import, never defaulted.

**No `shin` column, and none was ever dropped — see the v1.19 amendment
above for the correction.** `daily.shin` (via `/log`) has been the sole
source since Phase 0; Airtable's own `Shin (0-3)` field was empty on
every row.

### `weekly` / `benchmarks` (schema migrated 12 Aug 2026, migration 006, v1.19)
Ported as-is, plus real `date` columns for the week boundary:
`weekly.week_start` (Monday, PK) and `weekly.week_end` (Sunday), both
`CHECK`-constrained to a clean Mon–Sun span, parsed from the Airtable
`Dates` free text (`dates_label`, kept for audit only — never read by
compute or the frontend) — see the v1.19 amendment above for why this
doesn't depend on `full_plan.md`. `benchmarks` holds the corrected
1500 m (23 Sep) and 800 m (26 Sep) dates, unique on `(test, date)`.

**The one-time Airtable port ran 12 Aug 2026 (v1.20)** —
`ingest/airtable_port.py` wrote 28 `sessions`, 10 `weekly`, and 4
`benchmarks` rows (one undated Benchmarks row skipped — see the v1.20
amendment above), and `activities.session_id` was backfilled separately
(35 rows linked; every remaining `NULL` predates the 20 Jul 2026 Airtable
logging start). This is a one-time snapshot, not a live sync — Airtable
stays authoritative until the Meso 1 boundary cutover (§12, v1.20).

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
| `last_night` | **Added v1.26, §8.1 Panel 1.** Sleep/RHR/HRV for the most recent `biometrics` row, plus a value list scoped to the *current device only* (reuses `rhr_baseline`/`hrv_baseline`'s own `_rows_on_current_device` filter — CLAUDE.md rule 5) and a computed `band_possible_from` date (`first_date_on_current_device + (HRV_BASELINE_MIN_DAYS − 1)` days). **Deliberately computes no band** — see the v1.26 amendment for the full reasoning. A null sensor reading stays null (rule 12). **`days_behind` added v1.30** (`as_of - <latest row's date>`) — lets the render layer state which night is shown and flag when the gap exceeds the clamp's normal one-day lag, see the v1.30 amendment. |
| `session_for_date` | **Added v1.26, §8.1 Panel 2.** The single `sessions` row for a given date (`sessions.date` is unique, §5), narrowed to `session_type`/`purpose`/`prescription`/`done`. No row is `None`, a real state, not an error. |
| `today_flag` | **Added v1.26, §8.1 Panel 3.** At most one of `{shin, illness, volume_ramp}`, evaluated in that order, first hit wins, `None` if nothing qualifies. Rule 1: `daily.shin > 0` today or yesterday (today first), **NULL is never a hit**. Rule 2: `daily.illness is True` today or yesterday (today first). Rule 3: completed rolling 7-day km (window ending **yesterday**, never today — "never project the current week forward") more than `TODAY_FLAG_VOLUME_RAMP_PCT` (10%, strict `>`) above the preceding completed 7-day window, via `rolling_7d_km`/`ramp_pct`. **Distinct from `ramp_pct`'s own row above**: that compares calendar Mon–Sun weeks (`weekly_km`, §8.2); this compares two trailing 7-day windows (`rolling_7d_km`) — same 10% tolerance, different question, not shared code. **Added v1.27 — rule 3 is suppressed entirely, falling through as a non-match, if either 7-day window contains any date before `UNDERSTATED_VOLUME_CUTOFF` (§7's own v1.7 floor-not-measurement note, same constant `shin_series` already reads).** No caveat, no warning render — see the v1.27 amendment for why a caveated number was rejected. Suppression lifts 2026-08-22, once both windows clear the cutoff. |

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
| Most recent night (titled "Last night" v1.26–v1.29, renamed v1.30 — see the v1.30 amendment) | Sleep, RHR, HRV | **Built v1.26 without a band — deferred, see the v1.26 amendment.** Three raw values, a current-device-era-only value list, and one note stating no band exists yet, that Amazfit baselines don't transfer, and the computed date a band becomes possible. Gains the originally-specified "vs *his* band" once `rhr_baseline`/`hrv_baseline` (§7) have enough FR70 nights. **v1.30:** the reading's date is always shown next to the values, and a plain staleness line appears when `days_behind` exceeds the clamp's normal one-day lag — the panel never implies the reading is more current than it is. |
| Today's session | What to do | Pulled from `sessions` for the exact date: `session_type`, `purpose`, `prescription`, `done`. No row for today renders as plain text saying so. |
| Flag | Anything needing a decision | **At most one**, evaluated shin → illness → volume ramp, first hit wins (§7 `today_flag`, v1.26 amendment). If nothing qualifies, the slot is absent, not empty. **The volume-ramp rule is suppressed (not caveated) while either comparison window touches pre-8-Aug-2026 data — v1.27 amendment.** |

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

**Generate check-in — content, binding, added v1.28.** Not specified by
the panel table above; specified here, with the same standing as any
other binding decision in this file (CLAUDE.md rule 13). Week selection
is the ISO week (Mon–Sun) containing the day the page is viewed — on a
Sunday, that week is the one ending today. No week picker.

The block is lightweight Markdown — confirmed, not newly decided, by
§13 open question 3 (see the v1.28 amendment for why an implementation
brief that questioned this was wrong). The paste destination is a
Markdown-rendering chat client, so literal `#`/`**`/`-` syntax is
structure the reader benefits from, not noise. One heading line, plain
paragraphs, two bullet lists, no tables (read on a phone before
pasting), no emoji. Bold marks a field label only (`**Volume:**`,
`**Sleep:**`, …) — never emphasis, never a signal that a number is good
or bad.

Six pieces of content, in order:

1. **Week label and date range** — `weekly.week` / `weekly.dates_label`
   when a `weekly` row exists for the week's Monday; the ISO
   `week_start`–`week_end` otherwise.
2. **Volume** — actual km, summed from `activities` exactly as
   `weekly_km` (§7) defines it, against `weekly.planned_km`. A week with
   no `weekly` row states planned is unknown; it never omits the line or
   prints 0.
3. **Ramp** — this week's actual km vs the previous calendar week's, as
   a percentage (`ramp_pct`, §7, reused as-is — not a second formula). A
   zero-or-missing previous week renders as unknown, never 0% or ∞%,
   same as `ramp_pct`'s own `InsufficientData` contract.
4. **Session compliance** — one line per day, Monday through Sunday:
   date, `sessions.session_type`, `sessions.done`. A date with no
   `sessions` row says so explicitly; it is not skipped.
5. **Wellness** — mean sleep, mean RHR, mean HRV across the week's
   `biometrics` rows, each stated with the count of nights it averages
   over; a night with no `biometrics` row (§5's non-wear rule) is
   excluded from both the mean and the count, never averaged as 0. Shin
   is the **max** over the week's *answered* days only, stated with
   coverage as `n answered / 7` — an unanswered day is never counted
   toward the max and never coerced to 0 (§5's null rule).
6. **Data-quality line** — present only when the selected week or its
   ramp-comparison week (the preceding calendar week) contains any date
   before `UNDERSTATED_VOLUME_CUTOFF` (§7/§8.3's v1.7 constant, reused —
   no second hardcoded date). States plainly that the affected volume
   figures are a floor, not a measurement, and that the ramp % above is
   not a reliable comparison. **Deliberately a caveat, not a
   suppression** — the opposite of `today_flag` rule 3's v1.27 fix for
   the same underlying hazard. See the v1.28 amendment for why the two
   panels take different fixes.

**No composite score, no verdict, no adjective, anywhere in this
block — binding, ties directly to §3.1 and §3.3.** The block reports
numbers and coverage counts only. Judging the week is the coach's job on
the other end of the paste, not something this dashboard renders on
Luca's behalf — §3.1's finding that self-level/summary feedback made
performance worse in over a third of studied interventions is precisely
why. §3.3 is why the block exists at all: a number the coach can act on,
never a score about how the week went.

Every number in the block is computed and tested in
`compute/metrics.py`'s `week_checkin()`; the frontend
(`web/src/panels/checkinCopy.ts`) only formats the returned dict into
the Markdown block above (CLAUDE.md rule 3).

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
the reasoning. **Full-plot-height as of v1.22:** v1.16's hatch filled only
under the `rolling_7d_km` line's own height; once real pre-FR70 `shin`
readings existed in this range (v1.21), that left a shin marker with
nothing marking it as sitting against understated volume. The hatch now
renders as a markArea spanning the full plot height, behind both series,
still day-by-day off the same flag — see the v1.22 amendment. §10's three
shin marker states are unchanged by this.

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

- **Global range selector:** `7d · 30d · 90d · 6m · 1y · all`. **Built for the
  §8.3 panel in v1.18** — see that amendment for the architecture (emitted
  once at the widest range, filtered client-side, per-range coverage
  precomputed in `build_data.py`). Each range should display the **mean for
  that window and the delta vs the previous equivalent window** — this is
  the genuinely useful part of the reference design, but it is **not yet
  built** (v1.18 deferred it explicitly; §13). Applies to `rolling_7d_km`
  only — §7 forbids any mean of `shin`.
- **Charts stay clean.** No inline annotations, ever. **A hover tooltip is
  not an inline annotation** (v1.18) — this rule bans annotations baked
  into the chart itself, not on-demand inspection triggered by the athlete.
- **Tap/click a day or week** → a single shared detail drawer opens **above** the
  chart, showing that day's sessions, journal, habits, shin, and biometrics.
  One drawer component, reused everywhere. **Not yet built anywhere** (§13)
  — do not assume it shipped alongside the v1.18 hover tooltip, which is a
  separate, narrower feature (date/km/shin only, no sessions/journal/habits).
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
   a `check_ins` table the coach reads? **Confirmed and closed, v1.28: Markdown**,
   lightweight only (one heading, plain paragraphs, bullet lists, bold field
   labels, no tables, no emoji) — the destination is a Markdown-rendering chat
   client. An implementation brief questioned this as still-open and was wrong
   to; see the v1.28 amendment for the correction and the full content spec in §8.2.
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

6. *(added v1.18)* §9's per-range mean and delta-vs-previous-window for
   `rolling_7d_km` — the range selector itself shipped in v1.18, but the
   mean/delta display did not. It needs its own precomputed values per
   range (the window's mean, plus the prior equivalent window's mean for
   the delta), added to `build_data.py`'s `coverage_by_range`-style
   per-range output alongside the existing counts. Not answered here —
   flagged so it isn't silently skipped when this panel is next touched.

7. *(added v1.18)* §9's tap-to-inspect detail drawer (day/week → sessions,
   journal, habits, shin, biometrics). Blocked on `sessions`/`weekly`
   porting at Phase 2 (§8.4, §12) — those tables don't exist yet, so the
   drawer has nothing to show for two of its five fields. Revisit once
   Phase 2 lands.

**Resolved in v1.1 and moved out of this list:** null-vs-zero for `shin`
(§5, §7, §10); `/log` form layout (§8.5); archive/backup location (§4, §11.6).
