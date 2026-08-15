# Runbook — 14 Aug to 10 Sep unattended window

Written for whoever is checking on the dashboard from a phone, at camp or
between exams, with no laptop and no ability to touch code. If you're
comfortable with git and a terminal, skip to "Recovery on ~10 September" —
everything before that is written for a non-technical read.

Nobody can fix anything in this repo until roughly 10 September. This
document was written on 14 August as the last thing done before that gap
starts, after an audit of every automated piece.

---

## 1. How to tell, from the phone, that the pipeline is alive

Open **`github.com/donpino/luca-dashboard/actions`** in the phone browser.
That's the ground truth — more reliable than the dashboard site itself
(see §2 for why).

You'll see three workflows, each running on its own daily schedule:

| Workflow | What it does | Runs around |
|---|---|---|
| **Garmin sync** | pulls yesterday's biometrics/activity from Garmin into the database | ~05:00–06:15 UTC |
| **Deploy** | rebuilds the site's data and redeploys it, chained right after Garmin sync finishes | ~06:15 UTC, a few minutes after sync |
| **Nightly backup** | dumps the whole database to private storage | ~03:00–04:45 UTC |

**Healthy** looks like: each workflow has a green check mark next to
today's date, once a day, every day. Tap into "Garmin sync" specifically —
if today's run is green, the site's data is current.

**Not healthy** looks like: a red X next to a run, or — more subtly — no
run at all for today's date sitting at the top of the list. A red X means
it ran and failed (see §3 for what that looks like per-workflow). No run
at all is rarer and means the schedule itself didn't fire.

You do not need to open the run's logs to know whether the site is
current. The check mark is enough for that. The one exception — a single
missing activity, not a stale site — is covered in §4 item 7.

## 2. "Stale" vs. "down" on the Today page

This matters because **the Today page has no visible "as of" date or
freshness indicator on screen** — if the pipeline stops updating, the page
will keep showing old numbers that look exactly as valid as fresh ones.
The page itself cannot tell you it's stale; only the Actions tab (§1) can.

- **Down** — the site doesn't load at all, or shows a loading spinner
  forever, or an explicit "Couldn't load today.json" error message. This
  is a deploy problem, not a data problem — see §3.
- **Stale** — the site loads fine, shows numbers, but they stop changing.
  The clearest phone-only tell: the **Sleep / RHR / HRV** numbers in the
  "Last night" panel are real overnight measurements — they move around
  night to night. If the exact same three numbers are still showing two
  or three days running, that's staleness, not a quiet week. Cross-check
  against §1's Actions tab to confirm.

Cloudflare Access sitting in front of the site (the login screen) is a
separate layer from all of this — see §4's last row.

## 3. What breaks first, per piece, and what it looks like

**Garmin sync** — the piece most likely to break, because it depends on
Garmin's own login flow, which is outside this project's control and
changes without notice. If it fails: "Garmin sync" shows a red X in
Actions. The Today/Week pages keep showing the last successful day's data
(stale, not down — §2) because Deploy skips running entirely when the
sync it's chained to fails (by design — a partially-written database
should never get built and published). No data is lost while this is
broken (see §6) — it just isn't fetched from Garmin yet.

**Deploy** — least likely to break on its own, since it only runs after a
successful sync and doesn't touch Garmin or third-party auth. If it fails:
red X on "Deploy" in Actions, site keeps serving whatever it last
successfully published (stale, not down).

**Backup** — if it fails, nothing user-facing changes at all — the site
and sync are unaffected. Only the nightly database snapshot is
skipped for that night. Not urgent to react to; see §5.

**Cloudflare Access** — this is the login screen (email + one-time code)
in front of the site, not a workflow, so it won't show up in Actions at
all. If the login session has expired, opening the site prompts for an
email one-time code again — a normal, expected screen, not a sign
anything is broken. See §4 for whether this is likely to happen during
the gap.

## 4. Findings from the 14 August audit — what was checked and what it means

1. **Deploy chains after sync correctly.** Confirmed the Deploy workflow
   is *not* push-only — it runs on `workflow_run` chained after Garmin
   sync completes, in addition to `push` and manual triggers. Verified
   against the actual run history: Deploy fired automatically right after
   each of the last several days' scheduled syncs. This was the single
   highest-priority risk on the list and it checked out — no fix needed.

2. **Scheduled-failure email is very likely OFF by default and needs a
   manual check.** GitHub does not email on a failed scheduled workflow
   unless the *personal* GitHub account setting **Settings → Notifications
   → System → Actions** is explicitly set to "Email" or "Only notify for
   failed workflows" — it defaults to "Don't notify." Separately, even
   with that setting on, GitHub only emails whoever last edited the `cron`
   line in the workflow file (confirmed: that's Luca's own commits on both
   `sync.yml` and `backup.yml`), not every repo watcher. **Action before
   losing laptop access: open that GitHub notification setting once and
   confirm it isn't "Don't notify."** This can't be checked or changed
   from this session — it's a personal account setting, not a repo file.
   Also confirmed: a scheduled workflow only auto-disables after 60 days
   of total repo silence — the 4-week gap is well inside that, not a risk
   here.

3. **Garmin token: no fixed expiry found, refresh is automatic and
   persisted.** The cached login token is a directory saved between runs
   via GitHub's Actions cache, re-saved every day the sync succeeds, so it
   never goes 7 days unused (which is when GitHub would evict it). Reading
   the currently-installed Garmin library's source directly confirmed it
   proactively refreshes the token and writes the refreshed version back
   to that same cache directory on every run — this is automatic, not
   something that needs a human to trigger. There's no publicly documented
   fixed lifetime on Garmin's side, so no specific date can be predicted
   for when it might need a fresh login. If it ever does need one (MFA
   required, cache lost), the run fails fast with an actionable error
   instead of hanging — see §6's recovery command.

4. **Backups are running.** Checked the private backup storage directly:
   the most recent object is from **14 August, 04:42 UTC, 337 KB**, one
   day after a 335 KB backup and two days after a 308 KB one — growing
   steadily as expected, one new file per night. No gaps found. At this
   size, a month of nightly backups is a few megabytes — nowhere near the
   storage limit.

5. **Found and fixed: the Garmin/Supabase Python dependencies were
   completely unpinned.** `ingest/requirements.txt` listed `garminconnect`,
   `python-dotenv`, and `supabase` with no version numbers at all, meaning
   every scheduled run did a fresh install of whatever each package's
   latest release happened to be that day. This was checked live, not
   theoretically: installing fresh right now pulled `garminconnect`
   version `0.3.10`, while the version actually tested against this
   repo's own test suite was `0.3.9` — the drift was already happening.
   Fixed by pinning all three to the exact versions verified against the
   test suite (`garminconnect==0.3.9`, `python-dotenv==1.2.2`,
   `supabase==2.31.0`), confirmed with a clean install and a full test
   pass. This is the one thing on this list that could plausibly have
   broken the sync mid-window with no warning, and it no longer can — a
   package update now has to be pulled in deliberately, not by accident.
   Everything else was already pinned correctly: `wrangler` at `4.120.0`,
   `pytest` at `9.1.1`, and the frontend's npm packages via the committed
   lockfile (`web/package-lock.json`, used by `npm ci`, which installs
   exact versions regardless of the ranges in `package.json`). GitHub
   Action versions (`actions/checkout@v4` etc.) are pinned to major
   version only, which is normal practice for those, not a risk.

6. **Cloudflare Access session — informational only, nothing changed.**
   The Access policy in front of the site is configured for a **one-month
   session** (confirmed in the spec's own record of when this was set up,
   10 August). Whether it survives the full gap depends on exactly when
   the phone last completed the email one-time-code login — that
   timestamp isn't something this session has access to. **If it's been
   a few days since the site was last opened and logged into, it's worth
   opening it once now and confirming a fresh login before losing good
   signal at camp** — re-doing email OTP on poor camp signal is
   inconvenient but not damaging; nothing behind it (the data, Supabase)
   depends on this session, it only gates who can view the page.

7. **Incident, 15 August — sync failed overnight, fixed same day. Not the
   pin from item 5 above; a different cause, one worth knowing about
   because it can recur during this gap.** Garmin returned an activity
   type (`indoor_cardio`, an indoor gym cardio session) the ingest script
   had never seen before and had no mapping for. By design, an unknown
   activity type used to abort the *entire* sync run rather than guess —
   which meant that morning's biometrics, every other activity that day,
   and the site rebuild all got skipped, not just the one odd activity.
   Fixed same day: (1) that specific type is now mapped, and the missed
   day's data was backfilled; (2) more importantly, the behaviour
   changed — an unrecognised activity type from here on **skips just
   that one activity** (named in a warning on the run's summary page)
   and lets the rest of the day, and every following day, sync normally.
   The run still shows green.

   **What this means for a phone check during the gap:** a green
   "Garmin sync" run is still reliable proof the site is current
   (§1) — that hasn't changed. What *can* now happen invisibly is a
   single missing activity, e.g. a new class type or piece of gym
   equipment Garmin logs under a name never seen before. If a specific
   session looks missing from the site but the day around it looks
   otherwise normal, open that day's "Garmin sync" run and look for a
   line starting `::warning::` naming the activity and its type — that
   confirms it, and there's nothing to do about it from a phone. The
   fix (one line added to `ingest/sync.py`'s `TYPE_MAP`, plus running
   `sync.py --from <date> --to <date>` to pull that activity in) is a
   two-minute job once someone's back at a laptop in September — nothing
   is lost by waiting, Garmin keeps the activity on its own servers in
   the meantime.

## 5. Safe to ignore until September

- **Backup failures**, if they ever show a red X. Nothing user-facing
  breaks; it only means one night's database snapshot is missing. Worth a
  glance in September, not worth reacting to mid-exam.
- **The 60-day scheduled-workflow auto-disable.** Confirmed inapplicable —
  this gap is 4 weeks, the disable threshold is 60 days of total silence.
- **A Cloudflare Access re-login prompt.** Expected, not a sign of
  breakage — see §4 item 6.
- **wrangler / GitHub Action version numbers.** All confirmed pinned;
  nothing here can float to a new major version mid-window on its own.

## 6. No data is ever lost by any of this

Garmin keeps every night's sleep, HR, and HRV, and every activity, on its
own servers indefinitely. If the sync stops running for the entire
four-week gap, nothing is lost — it's just not copied into this project's
database yet. `sync.py` was built from day one to backfill any date range
on request (see §7 below), so catching up in September is a single
command, not a manual re-entry job.

## 7. Recovery commands for ~10 September

Run these from a laptop with the repo checked out, `ingest/.env` filled in
(`GARMIN_EMAIL`, `GARMIN_PASSWORD`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`), and the pinned dependencies installed.

**1. Check whether the pipeline needs recovery at all** — look at the
Actions tab first (§1). If every day shows green, skip straight to normal
operation; nothing below is needed.

**2. If Garmin sync has red Xs (auth/token issue) — refresh the token
locally, then re-seed the GitHub secret:**

```bash
cd ingest
python sync.py            # logs in interactively, answers MFA if prompted
tar -C ~/.garminconnect_luca_dashboard -cf - . | base64 | pbcopy
```

Paste the copied value into **Settings → Secrets and variables → Actions →
`GARMIN_TOKEN_SEED`** on GitHub (replace the existing value), then re-run
the failed "Garmin sync" workflow from the Actions tab.

**3. Backfill any days the sync missed**, once auth is working again —
`sync.py` takes `--from` / `--to` (`YYYY-MM-DD`, both required together;
omit both for the default trailing-3-day window):

```bash
cd ingest
python sync.py --from 2026-08-22 --to 2026-09-10
```

Re-running an already-synced date range is safe — every write is an
upsert (`ON CONFLICT (date) DO UPDATE`), never a duplicate insert
(CLAUDE.md rule 4). Adjust the `--from` date to whichever day the last
green "Garmin sync" run actually covered.

**4. Rebuild and redeploy** — normally automatic after step 3's sync, but
to force it manually:

```bash
cd compute && python build_data.py
```

or trigger the "Deploy" workflow manually from the Actions tab
(`workflow_dispatch`).

**5. Confirm** — open the site, confirm the Today page shows the actual
current date's session and last night's real numbers, and confirm the
Week page's volume picture includes the camp block.

---

*Written 14 August 2026, against `DASHBOARD_SPEC.md` v1.29. If anything in
this document turns out to be wrong when read in September, trust the spec
and the workflow files over this document — this is a snapshot, not a
second source of truth.*
