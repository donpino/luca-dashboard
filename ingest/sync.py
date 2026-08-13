"""Garmin → Supabase ingest. ONE entrypoint for both the manual backfill and
the future scheduled job (CLAUDE.md build order, DASHBOARD_SPEC.md §6) —
there is no separate backfill script.

Usage:
    python sync.py [--from YYYY-MM-DD] [--to YYYY-MM-DD]

Both omitted defaults to a trailing 3-day window ending yesterday. If only
one of --from/--to is given, that's a usage error — pass both or neither.

Two clamps apply after resolving the window, both logged when they fire:
  - --to is never today or later. Today's steps/stress/body-battery are
    mid-day values; a row written now would stay permanently
    half-recorded. A --to of today or later clamps to yesterday.
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
from datetime import date, timedelta
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
}


class UnmappedActivityTypeError(RuntimeError):
    """A Garmin typeKey has no entry in TYPE_MAP — spec §5 requires this to
    abort the run, never fall through to a silent 'other'."""


def normalize_type(type_key: str) -> str:
    try:
        return TYPE_MAP[type_key]
    except KeyError:
        raise UnmappedActivityTypeError(
            f"Garmin typeKey {type_key!r} has no TYPE_MAP entry. Spec §5 "
            "(v1.3) requires a hard error here, never a silent default to "
            "'other' — add an explicit mapping before re-running."
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


def resolve_window(from_arg: str | None, to_arg: str | None) -> list[date]:
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


def sync_biometrics(client, db: Client, d: date) -> None:
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
        "body_battery_min": stats.get("bodyBatteryLowestValue"),
        "body_battery_max": stats.get("bodyBatteryHighestValue"),
        "steps": stats.get("totalSteps"),
        "stress_avg": stats.get("averageStressLevel"),
        "device": DEVICE,
    }
    db.table("biometrics").upsert(row, on_conflict="date").execute()
    print(
        f"{ds}: biometrics upserted "
        f"(sleep={sleep_total_min is not None}, rhr={rhr is not None}, "
        f"hrv={hrv_overnight is not None}, hrv_status={hrv_status!r})."
    )


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
        canonical_type = normalize_type(detail["activityTypeDTO"]["typeKey"])

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
        print(
            f"{ds}: activity {activity_id} ({canonical_type}) upserted"
            + (f", linked to session {session_id}." if session_id else ".")
        )
    return count


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
    args = parser.parse_args()

    days = resolve_window(args.from_, args.to_)
    if not days:
        return

    client = get_client()
    db = get_supabase()

    # Fetched once per run, not per activity — and unscoped to the sync
    # window (all sessions are ~28 rows, cheap) since the repair pass below
    # needs the full date range anyway, not just this run's window.
    sessions_rows = db.table("sessions").select("id,date").execute().data
    session_map = build_session_map(sessions_rows)

    total_activities = 0
    for d in days:
        sync_biometrics(client, db, d)
        total_activities += sync_activities(client, db, d, session_map)

    linked, still_null = repair_session_links(db, session_map)

    print(
        f"Done. {len(days)} day(s) processed "
        f"({days[0].isoformat()}..{days[-1].isoformat()}), "
        f"{total_activities} activity row(s) upserted. "
        f"Repair pass: {linked} link(s) applied, {still_null} left NULL."
    )


if __name__ == "__main__":
    main()
