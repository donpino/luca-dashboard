"""Garmin → Supabase ingest. ONE entrypoint for both the manual backfill and
the future scheduled job (CLAUDE.md build order, DASHBOARD_SPEC.md §6) —
there is no separate backfill script.

Usage:
    python sync.py [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--include-today]

Both omitted defaults to a trailing 3-day window ending yesterday. If only
one of --from/--to is given, that's a usage error — pass both or neither.

Two clamps apply after resolving the window, both logged when they fire:
  - --to is never today or later. Today's steps/stress/body-battery are
    mid-day values; a row written now would stay permanently
    half-recorded. A --to of today or later clamps to yesterday.
    The one exception is --include-today (spec v1.36, the dashboard's
    "Sync now" button): today is appended to the window and its
    biometrics/hr_daily rows are written with is_partial = true. The
    next scheduled run's trailing window rewrites that date as a complete
    day with is_partial = false, so a partial row is never permanent and
    never unlabelled. The scheduled run never passes this flag.
  - --from is never earlier than GARMIN_SOURCE_START (2026-08-08), the
    Strava/Garmin source boundary (spec §6). Earlier dates belong to the
    one-time Strava archive import, not this path.

Writes are upserts — ON CONFLICT (date) DO UPDATE for biometrics,
ON CONFLICT (id) DO UPDATE for activities — never inserts (CLAUDE.md
rule 4). Re-running the same window is safe and idempotent.

Non-wear rule (spec §5, §6 v1.4): a day writes a biometrics row only if at
least one of sleep_total_min / rhr / hrv_overnight came back non-null.
Garmin returns structural zeros (totalSteps: 0, etc.) for days the watch
wasn't worn, and a zero-filled row would be indistinguishable from a real
quiet day (CLAUDE.md rule 12 — null is never coerced to zero). All-null
days are skipped entirely, not written as a row of nulls.

Credentials: GARMIN_EMAIL/GARMIN_PASSWORD (consumed by garmin_client.py)
and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, all read from the environment
via ingest/.env — never hardcoded, never logged (CLAUDE.md rule 8). The
service role key bypasses RLS entirely, so RLS is NOT the safety boundary
on this path — the date-window clamps, the source boundary, and the
upsert-only rule above are (see DASHBOARD_SPEC.md v1.4).
"""

import argparse
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

from garmin_client import get_client

load_dotenv(Path(__file__).parent / ".env")

# spec §6 — the Strava archive import writes activities dated on or before
# 7 Aug 2026; this path writes 8 Aug 2026 onward only.
GARMIN_SOURCE_START = date(2026, 8, 8)

# Not an API field on any endpoint used here — hardcoded per spec §5.
DEVICE = "fr70"

# Allowlist, not a blocklist: an unmapped Garmin typeKey is a hard ingest
# error (spec §5, v1.3), never silently defaulted to 'other'. Extend this
# deliberately as new activity types are actually observed — that silence
# is what makes rule 6 (cycling excluded from weekly_km) enforceable.
TYPE_MAP = {
    "running": "running",
    "trail_running": "running",
    "track_running": "running",
    "treadmill_running": "running",
    "street_running": "running",
    "indoor_running": "running",
    "cycling": "cycling",
    "road_biking": "cycling",
    "mountain_biking": "cycling",
    "gravel_cycling": "cycling",
    "cyclocross": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "strength_training": "other",
    "walking": "other",
    "hiking": "other",
    "yoga": "other",
    # parentTypeId 29 (fitness equipment), same category as
    # strength_training — confirmed against the 14 Aug 2026 incident
    # activity (0 distance, avgHR 136, "Cardio"): gym cardio work, not the
    # stationary bike (that's a separate indoor_cycling activity, already
    # mapped to 'cycling' above). See DASHBOARD_SPEC.md incident log.
    "indoor_cardio": "other",
    # First seen 7 Sep 2026 (activity 24276871331), skipped by the v1.34
    # skip-and-warn path during the v1.35 backfill. Not running, not
    # cycling — counts toward strain, never toward weekly_km (rule 6).
    "volleyball": "other",
}


class UnmappedActivityTypeError(RuntimeError):
    """A Garmin typeKey has no entry in TYPE_MAP. Spec §5 (v1.3, amended
    v1.34) requires this activity to be skipped and named, never silently
    defaulted to 'other' — but per the 15 Aug 2026 incident, it must no
    longer abort the whole run (see sync_activities)."""


def normalize_type(type_key: str) -> str:
    try:
        return TYPE_MAP[type_key]
    except KeyError:
        raise UnmappedActivityTypeError(
            f"Garmin typeKey {type_key!r} has no TYPE_MAP entry. Spec §5 "
            "(v1.3) requires never defaulting silently to 'other' — add an "
            "explicit mapping before this activity can be written."
        ) from None


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} not set. Copy ingest/.env.example to ingest/.env and "
            "fill in real values."
        )
    return value


def get_supabase() -> Client:
    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def resolve_window(from_arg: str | None, to_arg: str | None, include_today: bool = False) -> list[date]:
    today = date.today()
    yesterday = today - timedelta(days=1)

    if from_arg is None and to_arg is None:
        start, end = yesterday - timedelta(days=2), yesterday
    elif from_arg is not None and to_arg is not None:
        start, end = date.fromisoformat(from_arg), date.fromisoformat(to_arg)
    else:
        raise SystemExit(
            "--from and --to must be given together, or both omitted for "
            "the default trailing 3-day window."
        )

    if end >= today:
        print(
            f"--to {end.isoformat()} is today or later; clamping to "
            f"{yesterday.isoformat()} — today's values are mid-day and a "
            "row written now would stay permanently half-recorded."
        )
        end = yesterday

    if start < GARMIN_SOURCE_START:
        print(
            f"--from {start.isoformat()} is before the Garmin source "
            f"boundary {GARMIN_SOURCE_START.isoformat()}; clamping — "
            "earlier dates belong to the Strava import (spec §6)."
        )
        start = GARMIN_SOURCE_START

    if include_today:
        end = today

    if start > end:
        print(
            f"Window is empty after clamping ({start.isoformat()} > "
            f"{end.isoformat()}) — nothing to sync."
        )
        return []

    days, d = [], start
    while d <= end:
        days.append(d)
        d += timedelta(days=1)
    return days


def _minutes(seconds) -> int | None:
    return round(seconds / 60) if seconds is not None else None


def _local_wallclock(epoch_ms) -> str | None:
    """Garmin's *TimestampLocal fields are epoch ms already shifted to local
    time — reading them as UTC gives the local wall-clock reading, which is
    what biometrics.sleep_start_local/sleep_end_local store (migration 009)."""
    if epoch_ms is None:
        return None
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).replace(tzinfo=None).isoformat()


def _gmt_iso(gmt_string: str | None) -> str | None:
    """summaryDTO.startTimeGMT is a naive '2026-08-08T17:27:34.0' in UTC."""
    if gmt_string is None:
        return None
    return datetime.fromisoformat(gmt_string).replace(tzinfo=timezone.utc).isoformat()


def hr_pairs(timestamps_and_hr) -> list[list[int]]:
    """[[epoch_ms, bpm], ...] with null readings dropped — a null is a
    moment the watch measured nothing, never a zero (CLAUDE.md rule 12)."""
    return [[int(ts), int(hr)] for ts, hr in timestamps_and_hr if ts is not None and hr is not None]


def activity_hr_stream(details: dict) -> list[list[int]]:
    """directTimestamp + directHeartRate from get_activity_details. Every
    other metric in the response is ignored — and the call is made with
    maxpoly=0, so there is no polyline to ignore (CLAUDE.md rule 1)."""
    index = {m["key"]: m["metricsIndex"] for m in details.get("metricDescriptors") or []}
    if "directTimestamp" not in index or "directHeartRate" not in index:
        return []
    ti, hi = index["directTimestamp"], index["directHeartRate"]
    return hr_pairs((row["metrics"][ti], row["metrics"][hi]) for row in details.get("activityDetailMetrics") or [])


def build_session_map(sessions_rows: list[dict]) -> dict[str, str]:
    """date -> sessions.id, one entry per date.

    `sessions_date_key` (migration 006, v1.19) already guarantees at most
    one `sessions` row per date at the database level, so the duplicate
    branch below can't fire against live data — it's a tripwire in case
    that constraint is ever dropped, not a live-data code path (spec
    v1.24).
    """
    session_map: dict[str, str | None] = {}
    for row in sessions_rows:
        d = row["date"]
        if d in session_map:
            print(
                f"WARNING: multiple sessions rows found for date {d} — "
                "sessions_date_key should make this impossible; leaving "
                f"session_id NULL for {d}."
            )
            session_map[d] = None
        else:
            session_map[d] = row["id"]
    return {d: sid for d, sid in session_map.items() if sid is not None}


def sync_biometrics(client, db: Client, d: date, partial: bool = False) -> None:
    ds = d.isoformat()
    stats = client.get_stats(ds) or {}
    sleep = client.get_sleep_data(ds) or {}
    hrv = client.get_hrv_data(ds) or {}

    daily_sleep = sleep.get("dailySleepDTO") or {}
    hrv_summary = hrv.get("hrvSummary") or {}

    sleep_total_min = _minutes(daily_sleep.get("sleepTimeSeconds"))
    rhr = stats.get("restingHeartRate")  # no fallback to the sleep-endpoint value — spec §5
    hrv_overnight = hrv_summary.get("lastNightAvg")  # hrvSummary, not dailySleepDTO — spec §5

    # Non-wear rule — see module docstring.
    if sleep_total_min is None and rhr is None and hrv_overnight is None:
        print(f"{ds}: no sleep/rhr/hrv data — non-wear day, skipping biometrics row.")
        return

    hrv_status = hrv_summary.get("status")  # stored as returned, including literal "NONE" — never coerced

    row = {
        "date": ds,
        "sleep_total_min": sleep_total_min,
        "sleep_deep_min": _minutes(daily_sleep.get("deepSleepSeconds")),
        "sleep_rem_min": _minutes(daily_sleep.get("remSleepSeconds")),
        "sleep_light_min": _minutes(daily_sleep.get("lightSleepSeconds")),
        "sleep_awake_min": _minutes(daily_sleep.get("awakeSleepSeconds")),
        "rhr": rhr,
        "hrv_overnight": hrv_overnight,
        "hrv_status": hrv_status,
        "respiration_overnight": daily_sleep.get("averageRespirationValue"),
        "sleep_start_local": _local_wallclock(daily_sleep.get("sleepStartTimestampLocal")),
        "sleep_end_local": _local_wallclock(daily_sleep.get("sleepEndTimestampLocal")),
        "body_battery_min": stats.get("bodyBatteryLowestValue"),
        "body_battery_max": stats.get("bodyBatteryHighestValue"),
        "steps": stats.get("totalSteps"),
        "stress_avg": stats.get("averageStressLevel"),
        "device": DEVICE,
        # always written, so a complete re-sync clears a partial row (v1.36)
        "is_partial": partial,
    }
    db.table("biometrics").upsert(row, on_conflict="date").execute()
    print(
        f"{ds}: biometrics upserted "
        f"(sleep={sleep_total_min is not None}, rhr={rhr is not None}, "
        f"hrv={hrv_overnight is not None}, hrv_status={hrv_status!r})."
    )


def sync_hr_daily(client, db: Client, d: date, partial: bool = False) -> None:
    """All-day HR at Garmin's 2-minute cadence, for strain (spec §7). A day
    with no readings at all is non-wear and writes no row."""
    ds = d.isoformat()
    payload = client.get_heart_rates(ds) or {}
    samples = hr_pairs(payload.get("heartRateValues") or [])
    if not samples:
        print(f"{ds}: no all-day HR — non-wear day, skipping hr_daily row.")
        return
    db.table("hr_daily").upsert(
        {"date": ds, "samples": samples, "device": DEVICE, "is_partial": partial}, on_conflict="date"
    ).execute()
    print(f"{ds}: hr_daily upserted ({len(samples)} samples).")


def sync_activities(client, db: Client, d: date, session_map: dict[str, str]) -> int:
    ds = d.isoformat()
    for_day = client.get_activities_fordate(ds) or {}
    stubs = ((for_day.get("ActivitiesForDay") or {}).get("payload")) or []

    count = 0
    for stub in stubs:
        activity_id = stub["activityId"]
        # Field mapping is sourced from get_activity(id), not this list
        # endpoint — spec §5. type/id are top-level siblings of summaryDTO
        # on that response, not nested inside it.
        detail = client.get_activity(activity_id)
        type_key = detail["activityTypeDTO"]["typeKey"]
        try:
            canonical_type = normalize_type(type_key)
        except UnmappedActivityTypeError:
            # Skip-and-warn, not run-fatal (spec v1.34, 15 Aug 2026
            # incident): one unmapped typeKey must not stop biometrics and
            # every later activity/day from landing. The activity is never
            # written and never silently defaulted to 'other' — it is
            # named here so a human can add the mapping, then recovered by
            # a --from/--to backfill once they do.
            print(
                f"::warning::{ds}: activity {activity_id} has unmapped "
                f"Garmin typeKey {type_key!r} — skipped, not written. Add "
                "a TYPE_MAP entry in ingest/sync.py and re-run "
                f"`sync.py --from {ds} --to {ds}` to recover it."
            )
            continue

        summary = detail["summaryDTO"]
        distance_m = summary.get("distance")
        distance_km = distance_m / 1000 if distance_m is not None else None
        duration_raw = summary.get("duration")
        duration_s = round(duration_raw) if duration_raw is not None else None
        avg_pace_s_per_km = (
            duration_s / distance_km
            if duration_s is not None and distance_km
            else None
        )
        avg_hr = summary.get("averageHR")
        max_hr = summary.get("maxHR")

        row = {
            "id": activity_id,
            "date": ds,
            "type": canonical_type,
            "source": "garmin",
            "distance_km": distance_km,
            "duration_s": duration_s,
            "avg_pace_s_per_km": avg_pace_s_per_km,
            "avg_hr": round(avg_hr) if avg_hr is not None else None,
            "max_hr": round(max_hr) if max_hr is not None else None,
            "avg_cadence": summary.get("averageRunCadence"),
            "avg_vertical_oscillation": summary.get("verticalOscillation"),
            "avg_vertical_ratio": summary.get("verticalRatio"),
            "avg_ground_contact_ms": summary.get("groundContactTime"),
            "elevation_gain_m": summary.get("elevationGain"),
            "start_ts": _gmt_iso(summary.get("startTimeGMT")),
            # Archiving to Storage is a later commit — see spec v1.4.
            "raw_archive_path": None,
        }
        # session_id is deliberately omitted from the payload (not set to
        # None) when there's no date match — PostgREST's upsert only
        # updates columns present in the payload, so omitting the key
        # leaves an existing non-null session_id untouched on conflict,
        # per CLAUDE.md rule 4 and spec v1.24. Only include it when there
        # is a real link to make.
        session_id = session_map.get(ds)
        if session_id is not None:
            row["session_id"] = session_id
        db.table("activities").upsert(row, on_conflict="id").execute()
        count += 1
        # After the activities row, never before: activity_hr's FK needs it.
        # maxchart covers a 5.5 h session at 1 s; maxpoly=0 asks for no GPS.
        details = client.get_activity_details(activity_id, maxchart=20000, maxpoly=0) or {}
        stream = activity_hr_stream(details)
        if stream:
            db.table("activity_hr").upsert(
                {"activity_id": activity_id, "samples": stream}, on_conflict="activity_id"
            ).execute()
        print(
            f"{ds}: activity {activity_id} ({canonical_type}) upserted"
            + (f", linked to session {session_id}." if session_id else ".")
        )
    return count


# Garmin lifestyle-log behaviour name -> `daily` column (spec §5, §6, v1.38).
# By name, not behaviourId: custom behaviours (Melatonin) get an
# account-specific id. An unlisted name is skipped and named, never guessed.
LIFESTYLE_MAP = {
    "alcohol": "alcohol",
    "late meals": "late_meal",
    "stretching": "stretching",
    "illness": "illness",
    "melatonin": "melatonin",
    "injured": "injured",
    "cold showers/baths": "cold_shower",
    "nasal strips": "nasal_strips",
    "traveling/vacation": "travelling",
    "journaling": "journaling",
    "reading in bed": "reading_in_bed",
    "screens before bed": "screens_before_bed",
}
LIFESTYLE_COLUMNS = sorted(set(LIFESTYLE_MAP.values()))


def lifestyle_answers(report: dict) -> dict[str, bool]:
    """Garmin's YES/NO per mapped column. A behaviour with no logStatus was
    not answered that day and is absent — never read as NO (rule 12)."""
    out: dict[str, bool] = {}
    for b in report.get("dailyLogsReport") or []:
        name = (b.get("name") or "").strip().lower()
        status = b.get("logStatus")
        if status not in ("YES", "NO"):
            continue
        col = LIFESTYLE_MAP.get(name)
        if col is None:
            print(f"WARNING: unmapped Garmin lifestyle behaviour {b.get('name')!r} skipped — add it to LIFESTYLE_MAP deliberately.")
            continue
        out[col] = status == "YES"
    return out


def merge_lifestyle(existing: dict | None, answers: dict[str, bool]) -> dict[str, bool]:
    """The columns to write. A yes from either source counts: Garmin YES
    sets true; Garmin NO fills only a column still NULL, so it never undoes
    a yes ticked on /log. (/log saves untouched toggles as false, so a
    fill-only-NULL rule would drop every Garmin yes logged after /log.)"""
    existing = existing or {}
    updates = {}
    for col, yes in answers.items():
        current = existing.get(col)
        if yes and current is not True:
            updates[col] = True
        elif not yes and current is None:
            updates[col] = False
    return updates


def sync_lifestyle(client, db: Client, d: date) -> None:
    ds = d.isoformat()
    answers = lifestyle_answers(client.get_lifestyle_logging_data(ds) or {})
    if not answers:
        print(f"{ds}: lifestyle log not filled in, skipped.")
        return
    rows = db.table("daily").select(",".join(["date", *LIFESTYLE_COLUMNS])).eq("date", ds).execute().data
    updates = merge_lifestyle(rows[0] if rows else None, answers)
    if not updates:
        print(f"{ds}: lifestyle log already in daily.")
        return
    # Only the lifestyle columns go in the payload: on conflict PostgREST
    # leaves every other column (shin, journal, ...) untouched.
    db.table("daily").upsert({"date": ds, **updates}, on_conflict="date").execute()
    print(f"{ds}: lifestyle log upserted ({len(updates)} column(s)).")


def repair_session_links(db: Client, session_map: dict[str, str]) -> tuple[int, int]:
    """Self-healing pass over every `activities` row with `session_id IS
    NULL`, across all dates, not just this run's sync window — that's
    cheap (spec v1.24) and closes the check-in-timing hole: from 17 Aug
    onward `sessions` rows are written weekly, so an activity can be
    ingested before its session exists, and link-on-write alone would
    leave it NULL permanently once the sync window moves past that date.
    UPDATE of `session_id` only — no other column is touched.
    """
    unlinked = (
        db.table("activities").select("id,date").is_("session_id", "null").execute().data
    )

    linked = 0
    for row in unlinked:
        session_id = session_map.get(row["date"])
        if session_id is None:
            continue
        db.table("activities").update({"session_id": session_id}).eq("id", row["id"]).execute()
        linked += 1

    still_null = len(unlinked) - linked
    print(
        f"Repair pass: linked {linked} activity row(s) to a session, "
        f"{still_null} left NULL (no matching session)."
    )
    return linked, still_null


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_", metavar="YYYY-MM-DD")
    parser.add_argument("--to", dest="to_", metavar="YYYY-MM-DD")
    parser.add_argument(
        "--lifestyle-only",
        action="store_true",
        help="write only the Garmin lifestyle log (one-off backfill, v1.38)",
    )
    parser.add_argument(
        "--include-today",
        action="store_true",
        help="also write today, marked is_partial (manual 'Sync now' only)",
    )
    args = parser.parse_args()

    days = resolve_window(args.from_, args.to_, args.include_today)
    today = date.today()
    if not days:
        return

    client = get_client()
    db = get_supabase()

    # Fetched once per run, not per activity — and unscoped to the sync
    # window (all sessions are ~28 rows, cheap) since the repair pass below
    # needs the full date range anyway, not just this run's window.
    sessions_rows = db.table("sessions").select("id,date").execute().data
    session_map = build_session_map(sessions_rows)

    if args.lifestyle_only:
        for d in days:
            sync_lifestyle(client, db, d)
        return

    total_activities = 0
    for d in days:
        sync_biometrics(client, db, d, partial=d == today)
        sync_hr_daily(client, db, d, partial=d == today)
        total_activities += sync_activities(client, db, d, session_map)
        sync_lifestyle(client, db, d)

    linked, still_null = repair_session_links(db, session_map)

    print(
        f"Done. {len(days)} day(s) processed "
        f"({days[0].isoformat()}..{days[-1].isoformat()}), "
        f"{total_activities} activity row(s) upserted. "
        f"Repair pass: {linked} link(s) applied, {still_null} left NULL."
    )


if __name__ == "__main__":
    main()
