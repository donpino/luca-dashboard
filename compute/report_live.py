"""One-off acceptance-run driver — fetches from the live Supabase project
and reports real metric output. Not part of the compute-layer deliverable
(that's metrics.py's pure functions); this exists to demonstrate them
against real data and to prove the coordinate-stripping gate holds on
real output, same spirit as ingest/explore.py.

Credentials: same ingest/.env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
as ingest/sync.py. Read-only — never writes to Supabase or to
web/public/data/.
"""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))

from dotenv import load_dotenv  # noqa: E402
import os  # noqa: E402

from metrics import (  # noqa: E402
    assert_no_private_keys,
    rolling_7d_km,
    shin_series,
    weekly_km,
)

load_dotenv(Path(__file__).resolve().parent.parent / "ingest" / ".env")


def get_db():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def fetch_all(db, table, columns):
    rows, page, page_size = [], 0, 1000
    while True:
        r = (
            db.table(table)
            .select(columns)
            .range(page * page_size, page * page_size + page_size - 1)
            .execute()
        )
        rows.extend(r.data)
        if len(r.data) < page_size:
            break
        page += 1
    return rows


def main():
    db = get_db()
    activities = fetch_all(db, "activities", "date,type,distance_km,avg_cadence,"
                            "avg_vertical_oscillation,avg_vertical_ratio")
    daily = fetch_all(db, "daily", "date,shin")

    today = date.today()
    print(f"Today: {today.isoformat()} ({today.strftime('%A')})")
    print(f"activities rows fetched: {len(activities)}")
    print(f"daily rows fetched: {len(daily)}")
    print()

    # --- last 4 complete Mon-Sun weeks -------------------------------
    this_monday = today - timedelta(days=today.weekday())
    last_complete_sunday = this_monday - timedelta(days=1)
    last_complete_monday = last_complete_sunday - timedelta(days=6)

    print("weekly_km, last 4 complete weeks:")
    for i in range(4):
        wk_start = last_complete_monday - timedelta(weeks=3 - i)
        wk_end = wk_start + timedelta(days=6)
        km = weekly_km(activities, wk_start)
        print(f"  {wk_start.isoformat()}..{wk_end.isoformat()}: {km:.3f} km")
    print()

    # --- total running km by year ------------------------------------
    print("total running km by year:")
    by_year: dict[int, float] = {}
    for row in activities:
        if row["type"] != "running" or row.get("distance_km") is None:
            continue
        year = date.fromisoformat(row["date"]).year
        by_year[year] = by_year.get(year, 0.0) + row["distance_km"]
    for year in sorted(by_year):
        print(f"  {year}: {by_year[year]:.3f} km")
    print()

    # --- shin_series coverage ------------------------------------------
    if daily:
        earliest = min(date.fromisoformat(r["date"]) for r in daily)
    else:
        earliest = today
    result = shin_series(activities, daily, earliest, today)
    print(f"shin_series coverage, {earliest.isoformat()}..{today.isoformat()}: "
          f"{result['coverage']['answered']}/{result['coverage']['total']}")
    print(f"  series sample (last 3 days): {result['series'][-3:]}")
    print()

    # --- coordinate gate, run against real assembled output ----------
    output = {
        "weekly_km_last_4": [
            weekly_km(activities, last_complete_monday - timedelta(weeks=3 - i))
            for i in range(4)
        ],
        "running_km_by_year": by_year,
        "shin_series": result,
        "sample_impact_mechanics_fields": [
            {
                "avg_cadence": row.get("avg_cadence"),
                "avg_vertical_oscillation": row.get("avg_vertical_oscillation"),
                "avg_vertical_ratio": row.get("avg_vertical_ratio"),
            }
            for row in activities
            if row["type"] == "running" and row.get("avg_vertical_oscillation") is not None
        ][:3],
    }
    output_json = json.dumps(output, default=str)
    parsed = json.loads(output_json)
    try:
        assert_no_private_keys(parsed)
        print("Coordinate gate: PASS — no lat/lon/coord/polyline-shaped key found.")
    except ValueError as e:
        print(f"Coordinate gate: FAIL — {e}")
        raise

    has_vo_field = "avg_vertical_oscillation" in output_json
    print(f"verticalOscillation-derived field present in output: {has_vo_field} "
          f"(must be True — proves it wasn't falsely stripped)")


if __name__ == "__main__":
    main()
