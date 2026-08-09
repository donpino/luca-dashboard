"""One-time Strava archive import — DASHBOARD_SPEC.md §2 decision 9, §5, §6
(v1.5). Never the Strava API; reads the athlete's own account data export
(`activities.csv`) from a directory that lives OUTSIDE this repo and is
never copied into it — the export's `activities/` subfolder holds raw
per-activity `.fit.gz` files carrying GPS streams, and this script never
opens that subfolder at all.

Usage:
    python strava_import.py /absolute/path/to/export_dir

The path is a required CLI argument with no default (CLAUDE.md rule 14) —
an accidental default pointing inside the repo is exactly the mistake that
rule exists to prevent.

Source boundary (spec §6, binding): only rows dated on or before
7 Aug 2026 are imported. The 8 Aug 2026 run exists in both Strava's and
Garmin's export under two different ids, so ON CONFLICT (id) cannot
deduplicate it — only this date filter does. No lower bound: the export
runs back to 13 May 2023, three years earlier than spec decision 9
originally assumed ("Dec 2025"); decision 9 is amended in the same commit
to record that the full range is imported deliberately (v1.5).

Every row gets source='strava'. `type` is normalised to the CHECK-
constrained vocabulary via TYPE_MAP below; an unmapped Strava Activity
Type is a hard error, never silently 'other' (spec §5, v1.3).

Fields the export never carries at all — avg_vertical_oscillation,
avg_vertical_ratio, avg_ground_contact_ms — are written NULL, per spec §5's
"Strava-sourced rows carry structural NULLs" rule. avg_cadence is ALSO
written NULL despite the export in fact having an "Average Cadence"
column (see the v1.5 amendment): that column is per-leg strides/min, an
unconfirmed-unit mismatch against Garmin's summaryDTO.averageRunCadence
(full steps/min) that `impact_mechanics` (spec §7) joins across sources —
importing it unverified would silently corrupt that panel, which is worse
than a gap. avg_hr/max_hr are imported when present, NULL when the export
row leaves them blank — CLAUDE.md rule 12, null is never coerced to zero.

Units: the export carries two columns named "Distance" (rounded local-unit
km, then precise metres) and two named "Elapsed Time" (equal, int and
float seconds) — read by position within the header, not by name alone.
distance_km = precise_metres / 1000, mirroring the Garmin path's
metres->km conversion (sync.py). duration_s is already whole seconds, no
conversion. avg_pace_s_per_km is derived exactly as sync.py derives it:
duration_s / distance_km, None when distance_km is 0 or missing rather
than a division error or a fabricated pace.

Collision check (spec §5, this file's own docstring above): before any
write, every Strava id in scope is checked against existing
source='garmin' rows only — not against source='strava' rows, which would
make a second run of this same script abort on its own prior output and
break the "safe to run twice" requirement (item 9 of the commit
instructions, same idempotency rule as CLAUDE.md rule 4). Garmin and
Strava ids are different namespaces and should never collide regardless;
this proves it at import time rather than assuming it.

Writes are upsert — ON CONFLICT (id) DO UPDATE, batched, never insert.
"""

import argparse
import csv
import os
import re
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(Path(__file__).parent / ".env")

# spec §6 — Strava import writes activities dated on or before 7 Aug 2026
# only; the live Garmin path (sync.py) writes 8 Aug 2026 onward only.
STRAVA_SOURCE_END = date(2026, 8, 7)

# Allowlist, not a blocklist: an unmapped Strava Activity Type is a hard
# ingest error (spec §5, v1.3), never silently defaulted to 'other'.
# 'Workout' resolves to 'other' by a deliberate decision recorded in the
# v1.5 amendment: all 77 rows carrying that type in this export have
# distance=0, so the choice has zero effect on weekly_km, and the type
# mixes real interval-running sessions with non-running sports (Padel,
# Beach Volley, Go Kart) that this file cannot tell apart.
TYPE_MAP = {
    "Run": "running",
    "Ride": "cycling",
    "Workout": "other",
    "Weight Training": "other",
    "Walk": "other",
    "Swim": "other",
    "Hike": "other",
}


class UnmappedActivityTypeError(RuntimeError):
    """A Strava Activity Type has no TYPE_MAP entry — must abort the
    import rather than fall through to a silent 'other' (spec §5, v1.3)."""


class IdCollisionError(RuntimeError):
    """A Strava activity id already exists in the table under a
    source='garmin' row — the two id namespaces were assumed never to
    collide; this proves it rather than assuming it."""


# Reuses the PRINCIPLE explore.py's fixed coordinate-stripper established
# (match whole tokens, never a bare substring — the earlier bug matched
# "lat" inside "verticalOscillation" and silently dropped a real field),
# adapted to this file's Title-Case-with-spaces headers rather than
# camelCase JSON keys: a substring search for "lat" would false-positive
# on "Relative" or "Elevation" here too. Tokenizing on word boundaries and
# matching whole words avoids that class of bug in both namings.
PRIVATE_HEADER_SUBSTRINGS = re.compile(r"coord|polyline|start location", re.IGNORECASE)
PRIVATE_HEADER_TOKENS = {"lat", "lon", "latitude", "longitude"}


def is_private_column(name: str) -> bool:
    if PRIVATE_HEADER_SUBSTRINGS.search(name):
        return True
    tokens = {t.lower() for t in re.findall(r"[A-Za-z0-9]+", name)}
    return bool(tokens & PRIVATE_HEADER_TOKENS)


# The columns this script ever reads. Asserted below to be non-private —
# a static, load-time guarantee that no coordinate-shaped column can enter
# the read path, on top of the fact that CSV rows are read by explicit
# column name (an allowlist), never dumped wholesale the way explore.py's
# nested-JSON stripper has to.
READ_COLUMNS = (
    "Activity ID",
    "Activity Date",
    "Activity Type",
    "Elapsed Time",
    "Distance",
    "Average Heart Rate",
    "Max Heart Rate",
    "Elevation Gain",
)
assert not any(is_private_column(c) for c in READ_COLUMNS), (
    "A column this script reads looks coordinate-shaped — stop and check "
    "before importing anything."
)


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


def col_index(header: list[str], name: str, occurrence: int = 0) -> int:
    """occurrence=0 -> first match, -1 -> last. This export repeats some
    column names (a rounded local-unit copy, then a precise metric copy)."""
    matches = [i for i, h in enumerate(header) if h == name]
    if not matches:
        raise KeyError(f"Column {name!r} not found in export header.")
    return matches[occurrence]


def parse_float(raw: str) -> float | None:
    raw = raw.strip()
    return float(raw) if raw else None


def parse_int(raw: str) -> int | None:
    raw = raw.strip()
    return round(float(raw)) if raw else None


def read_rows(export_dir: Path) -> list[dict]:
    csv_path = export_dir / "activities.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"No activities.csv found in {export_dir}")

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        raw_rows = list(reader)

    id_idx = col_index(header, "Activity ID")
    date_idx = col_index(header, "Activity Date")
    type_idx = col_index(header, "Activity Type")
    elapsed_idx = col_index(header, "Elapsed Time", 0)  # int seconds
    distance_idx = col_index(header, "Distance", -1)  # precise metres
    avg_hr_idx = col_index(header, "Average Heart Rate")
    max_hr_idx = col_index(header, "Max Heart Rate", 0)
    elevation_idx = col_index(header, "Elevation Gain")

    parsed = []
    for r in raw_rows:
        activity_dt = datetime.strptime(r[date_idx], "%b %d, %Y, %I:%M:%S %p")
        distance_m = parse_float(r[distance_idx])
        distance_km = distance_m / 1000 if distance_m is not None else None
        duration_s = parse_int(r[elapsed_idx])
        avg_pace_s_per_km = (
            duration_s / distance_km
            if duration_s is not None and distance_km
            else None
        )
        parsed.append(
            {
                "id": int(r[id_idx].strip()),
                "date": activity_dt.date(),
                "strava_type": r[type_idx].strip(),
                "distance_km": distance_km,
                "duration_s": duration_s,
                "avg_pace_s_per_km": avg_pace_s_per_km,
                "avg_hr": parse_int(r[avg_hr_idx]),
                "max_hr": parse_int(r[max_hr_idx]),
                "elevation_gain_m": parse_float(r[elevation_idx]),
            }
        )
    return parsed


def normalize_type(strava_type: str) -> str:
    try:
        return TYPE_MAP[strava_type]
    except KeyError:
        raise UnmappedActivityTypeError(
            f"Strava Activity Type {strava_type!r} has no TYPE_MAP entry. "
            "Spec §5 (v1.3) requires a hard error here, never a silent "
            "default to 'other' — add an explicit mapping before "
            "re-running."
        ) from None


def to_activity_row(parsed: dict) -> dict:
    return {
        "id": parsed["id"],
        "date": parsed["date"].isoformat(),
        "type": normalize_type(parsed["strava_type"]),
        "source": "strava",
        "distance_km": parsed["distance_km"],
        "duration_s": parsed["duration_s"],
        "avg_pace_s_per_km": parsed["avg_pace_s_per_km"],
        "avg_hr": parsed["avg_hr"],
        "max_hr": parsed["max_hr"],
        "avg_cadence": None,
        "avg_vertical_oscillation": None,
        "avg_vertical_ratio": None,
        "avg_ground_contact_ms": None,
        "elevation_gain_m": parsed["elevation_gain_m"],
        # Archiving to Storage is a later commit — same deferred-gap note
        # as sync.py, spec v1.4.
        "raw_archive_path": None,
    }


def check_no_garmin_collision(db: Client, strava_ids: set[int]) -> None:
    existing = db.table("activities").select("id,source").execute().data
    garmin_ids = {row["id"] for row in existing if row["source"] == "garmin"}
    collisions = strava_ids & garmin_ids
    if collisions:
        raise IdCollisionError(
            f"{len(collisions)} Strava id(s) already exist as source='garmin' "
            f"rows — the two id namespaces were assumed never to collide: "
            f"{sorted(collisions)[:20]}{'...' if len(collisions) > 20 else ''}. "
            "Aborting before any write."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "export_dir",
        type=Path,
        help="Absolute path to the unzipped Strava export directory. "
        "Must live outside this repo.",
    )
    args = parser.parse_args()
    export_dir = args.export_dir.expanduser().resolve()

    repo_root = Path(__file__).resolve().parent.parent
    if repo_root == export_dir or repo_root in export_dir.parents:
        raise SystemExit(
            f"{export_dir} is inside the repo ({repo_root}). The export "
            "contains GPS data and must stay outside — CLAUDE.md rule 14."
        )

    all_rows = read_rows(export_dir)
    print(f"Read {len(all_rows)} row(s) from {export_dir / 'activities.csv'}")

    in_scope = [r for r in all_rows if r["date"] <= STRAVA_SOURCE_END]
    skipped = [r for r in all_rows if r["date"] > STRAVA_SOURCE_END]
    for r in skipped:
        print(
            f"  skipping id={r['id']} date={r['date'].isoformat()} — after "
            f"the {STRAVA_SOURCE_END.isoformat()} source boundary (spec §6); "
            "belongs to the Garmin path instead."
        )

    # Validate every type mapping up front — abort before touching Supabase
    # at all if anything is unmapped (item 4 of the commit instructions).
    activity_rows = [to_activity_row(r) for r in in_scope]

    db = get_supabase()
    strava_ids = {r["id"] for r in activity_rows}
    check_no_garmin_collision(db, strava_ids)
    print(f"Collision check passed — no overlap with source='garmin' ids.")

    chunk_size = 200
    for i in range(0, len(activity_rows), chunk_size):
        chunk = activity_rows[i : i + chunk_size]
        db.table("activities").upsert(chunk, on_conflict="id").execute()
        print(f"  upserted rows {i + 1}-{i + len(chunk)} of {len(activity_rows)}")

    type_counts: dict[str, int] = {}
    for r in activity_rows:
        type_counts[r["type"]] = type_counts.get(r["type"], 0) + 1
    dates_imported = [r["date"] for r in in_scope]

    print(
        f"\nDone. {len(activity_rows)} row(s) imported "
        f"({min(dates_imported).isoformat()}..{max(dates_imported).isoformat()}), "
        f"{len(skipped)} row(s) skipped (on/after {STRAVA_SOURCE_END.isoformat()}). "
        f"By type: {type_counts}."
    )


if __name__ == "__main__":
    main()
