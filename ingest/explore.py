"""Exploratory Garmin Connect pull — DASHBOARD_SPEC.md §5, §6 (v1.2).

Read-only against Garmin. Fetches daily stats, sleep, HRV, Body Battery and
activities for a few dates, plus one detailed activity record, so the
ingest/compute layers can be built against real-shaped data (the fixture
stage collapsed into this one per the v1.2 roadmap amendment, §12).

Writes two copies of everything fetched:
  - archive/explore/*.json  — raw, UNMODIFIED API responses. Gitignored
    (archive/ is permanently gitignored per CLAUDE.md rule 14) because
    activity records can carry GPS coordinates, polylines and start
    location — private under spec §4/§11, never to reach a public repo.
  - ingest/fixtures/*.json  — the same responses with any key matching
    /lat|lon|coord|polyline/i stripped (same regex CLAUDE.md rule 1 asserts
    against metrics.py's output). These ARE committed, so the strip has to
    happen before the file is written, not after.

No writes to Supabase. No reshaping, averaging, or cleaning of values —
raw fidelity only; the coordinate strip is a privacy gate, not a data edit.
"""

import json
import re
from datetime import date, timedelta
from pathlib import Path

from garmin_client import get_client

REPO_ROOT = Path(__file__).resolve().parent.parent
ARCHIVE_DIR = REPO_ROOT / "archive" / "explore"
FIXTURES_DIR = REPO_ROOT / "ingest" / "fixtures"

# Geometry (CLAUDE.md rule 1) plus identity/start-location fields the
# Garmin API actually returns (CLAUDE.md rule 1's "start location" and rule
# 9's "no surname ... no photograph") — found by walking real responses:
# `locationName` and `activityName` (Garmin names activities after the
# start location), `ownerFullName`/`ownerDisplayName`/
# `ownerProfileImageUrl*`, and `metadataDTO.userInfoDto` (nested block with
# the same). None of these are lat/lon/coord/polyline-shaped keys, so the
# narrower geometry-only regex silently let them through on the first pass.
# Account/device identifiers — a second real-data scan turned up
# `ownerId`, `userProfilePK`/`userProfilePk`/`userProfileId`, `deviceId`,
# `activityUUID`/`groupRideUUID`/bare `uuid`, and `timeZoneUnitDTO.unitId`.
# None of these are personal-name or location fields, but they're
# account-level identifiers with no use in any spec §5/§6 mapping — `device`
# is hardcoded 'fr70' in the ingest path, never looked up by deviceId.
# `serial`/`guid` are included defensively though nothing matched them in
# this pull. Real biometric values (HR streams, HRV readings, timestamps)
# are deliberately NOT matched here — the site publishes those by design.
PRIVATE_KEY_RE = re.compile(
    r"lat|lon|coord|polyline"
    r"|location|activityname"
    r"|fullname|displayname|profileimage|userinfodto|activityimages"
    r"|userprofile|ownerid|deviceid|serial|uuid|guid|unitid",
    re.IGNORECASE,
)

# `metricDescriptors` + `activityDetailMetrics` (from get_activity_details)
# together encode the full GPS polyline as an unlabeled per-point time
# series: the descriptor names an index as "directLatitude"/
# "directLongitude", and the raw numbers sit in each point's `metrics`
# array with no key attached to strip. A key-based filter can't catch that
# indirection, so both blocks are dropped from fixtures wholesale — the
# compute layer only ever needs the aggregate avg_* fields already present
# in the activity summary, never a raw per-point stream.
DETAIL_METRIC_KEYS = {"metricDescriptors", "activityDetailMetrics"}


def strip_coordinates(obj):
    if isinstance(obj, dict):
        return {
            k: strip_coordinates(v)
            for k, v in obj.items()
            if not PRIVATE_KEY_RE.search(k) and k not in DETAIL_METRIC_KEYS
        }
    if isinstance(obj, list):
        return [strip_coordinates(v) for v in obj]
    return obj


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str, ensure_ascii=False))


def capture(name: str, data) -> None:
    write_json(ARCHIVE_DIR / f"{name}.json", data)
    write_json(FIXTURES_DIR / f"{name}.json", strip_coordinates(data))
    print(f"  captured {name}  ->  {shape(data)}")


def shape(obj, depth: int = 0, max_depth: int = 2) -> str:
    """Compact structural preview: keys and value types, not values."""
    if depth >= max_depth:
        return "..."
    if isinstance(obj, dict):
        parts = [f"{k}: {shape(v, depth + 1, max_depth)}" for k, v in obj.items()]
        return "{" + ", ".join(parts) + "}"
    if isinstance(obj, list):
        if not obj:
            return "[]"
        return f"[{len(obj)} x {shape(obj[0], depth + 1, max_depth)}]"
    return type(obj).__name__


def find_one_run(activities: list[dict]):
    for a in activities:
        type_key = ((a.get("activityType") or {}).get("typeKey") or "").lower()
        if "run" in type_key:
            return a.get("activityId"), a
    return None, None


def main() -> None:
    client = get_client()

    today = date.today()
    dates = sorted({date(2026, 8, 8), today - timedelta(days=1), today - timedelta(days=2)})
    print(f"Dates: {[d.isoformat() for d in dates]}")

    for d in dates:
        ds = d.isoformat()
        print(f"\n{ds}")
        capture(f"garmin_stats_{ds}", client.get_stats(ds))
        capture(f"garmin_sleep_{ds}", client.get_sleep_data(ds))
        capture(f"garmin_hrv_{ds}", client.get_hrv_data(ds))
        capture(f"garmin_body_battery_{ds}", client.get_body_battery(ds))
        capture(f"garmin_activities_{ds}", client.get_activities_fordate(ds))

    print("\nrecent activities (for finding one run)")
    recent = client.get_activities(0, 20)
    capture("garmin_activities_recent", recent)

    run_id, run_summary_stub = find_one_run(recent)
    if run_id is None:
        print("\nNo running activity found in the last 20 activities — "
              "cannot confirm impact_mechanics fields from this pull.")
        return

    print(f"\nrun activity id: {run_id}")
    capture(f"garmin_activity_summary_{run_id}", client.get_activity(run_id))
    capture(f"garmin_activity_details_{run_id}", client.get_activity_details(run_id))

    print("\nDone. Raw responses in archive/explore/ (gitignored), "
          "coordinate-stripped copies in ingest/fixtures/ (safe to commit).")


if __name__ == "__main__":
    main()
