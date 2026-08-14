"""Headless production driver — CLAUDE.md Build order, DASHBOARD_SPEC.md §4/§12.

Fetches from the live Supabase project and writes pre-computed JSON to
web/public/data/ for the frontend to read. This is the only file in
compute/ that touches the network or the filesystem: metrics.py stays
pure (no network, no filesystem, no Supabase client — see its module
docstring) so that "metric definitions live in compute/metrics.py only"
(CLAUDE.md rule 3) is never blurred by fetch/write plumbing. Every field
written here comes directly from a tested metrics.py function; this
module assembles and serialises, it does not compute.

Credentials: ingest/.env locally (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY,
same as ingest/sync.py), GitHub Actions secrets in CI (CLAUDE.md rule 8).
Read-only against Supabase — service_role has SELECT only on `daily`
(migration 005) and RLS-gated SELECT on `activities`.

The coordinate-stripping gate (CLAUDE.md rule 1, §4/§11) runs against
every assembled payload before it is written — a private key anywhere in
the output aborts the write rather than shipping it.
"""

from __future__ import annotations

import calendar
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))

from dotenv import load_dotenv  # noqa: E402

from metrics import (  # noqa: E402
    InsufficientData,
    assert_no_private_keys,
    last_night,
    session_for_date,
    shin_series,
    today_flag,
    week_checkin,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

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


def _write_json(path: Path, payload: dict) -> None:
    """Serialises, gates on the coordinate check, then writes. `default=str`
    turns metrics.py's `date` objects into ISO-8601 strings (`date.__str__`
    is `date.isoformat`), matching report_live.py's existing convention."""
    output_json = json.dumps(payload, default=str, indent=2)
    assert_no_private_keys(json.loads(output_json))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(output_json)


# Widest window the §9 range selector will ever need — DASHBOARD_SPEC.md
# v1.18. "all" reaches back to 13 May 2023, the first `activities` row
# (the Strava-import backfill boundary, §6) — emitting shin_series() once
# at this width and letting the selector filter the already-computed
# series by date client-side (§9) means every range button reads from the
# one fetched JSON, never a second request and never a frontend recompute
# of rolling_7d_km/band/understated_volume/coverage (CLAUDE.md rule 3).
DATA_START = date(2023, 5, 13)

# §9's global range selector, scoped to the §8.3 panel for now (v1.18).
RANGE_OPTIONS = ("7d", "30d", "90d", "6m", "1y", "all")
DEFAULT_RANGE = "90d"  # unchanged from v1.17's fixed-window fix

_RANGE_DAY_COUNTS = {"7d": 7, "30d": 30, "90d": 90}
_RANGE_MONTH_COUNTS = {"6m": 6, "1y": 12}


def _shift_months(d: date, months: int) -> date:
    """`d` shifted back `months` calendar months, clamping the day to the
    target month's length (e.g. 31 Aug − 6mo → 28/29 Feb). No dateutil
    dependency — this is the one place month arithmetic is needed."""
    month_index = d.month - 1 - months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def _range_start(key: str, today: date, floor: date) -> date:
    """Start date for one §9 selectable range, clamped to `floor` (the
    widest date this build ever emits, `DATA_START`) so a range longer
    than the emitted series never points before the first plotted day."""
    if key == "all":
        start = floor
    elif key in _RANGE_DAY_COUNTS:
        start = today - timedelta(days=_RANGE_DAY_COUNTS[key] - 1)
    elif key in _RANGE_MONTH_COUNTS:
        start = _shift_months(today, _RANGE_MONTH_COUNTS[key])
    else:
        raise ValueError(f"unknown range: {key}")
    return max(start, floor)


def _range_starts(today: date, floor: date) -> dict[str, date]:
    return {key: _range_start(key, today, floor) for key in RANGE_OPTIONS}


def _range_coverage(series: list[dict], start: date, end: date) -> dict:
    """answered/total for one §9 range window, counted from the
    already-computed `series` — never recomputed (CLAUDE.md rule 3).
    Each entry's `date` is still a `date` object here, pre-JSON-encode."""
    window = [row for row in series if start <= row["date"] <= end]
    answered = sum(1 for row in window if row["shin"] is not None)
    return {"answered": answered, "total": len(window)}


def build_shin_series(db, today: date) -> dict:
    daily = fetch_all(db, "daily", "date,shin")
    activities = fetch_all(db, "activities", "date,type,distance_km")
    payload = shin_series(activities, daily, DATA_START, today)
    starts = _range_starts(today, DATA_START)
    payload["range_options"] = list(RANGE_OPTIONS)
    payload["default_range"] = DEFAULT_RANGE
    payload["range_start"] = starts
    payload["coverage_by_range"] = {
        key: _range_coverage(payload["series"], starts[key], today) for key in RANGE_OPTIONS
    }
    return payload


def _or_none(value):
    """InsufficientData -> None for JSON output. §8.1's panels already
    render their own "no data yet" state from a null field (same
    convention as shin_series' None-for-unanswered), so there is no
    separate insufficient-data shape to invent here — CLAUDE.md rule 13,
    this is spelled out in the v1.26 amendment rather than left implicit."""
    return None if isinstance(value, InsufficientData) else value


def build_today(db, today: date) -> dict:
    """§8.1 Today page — Panel 1 (last_night), Panel 2 (session), Panel 3
    (flag). One JSON file for the whole page: all three panels load
    together on the athlete's daily ten-second check, so one fetch beats
    three (DASHBOARD_SPEC.md v1.26 amendment)."""
    biometrics = fetch_all(db, "biometrics", "date,device,sleep_total_min,rhr,hrv_overnight")
    daily = fetch_all(db, "daily", "date,shin,illness")
    activities = fetch_all(db, "activities", "date,type,distance_km")
    session_rows = (
        db.table("sessions")
        .select("date,session_type,purpose,prescription,done")
        .eq("date", today.isoformat())
        .execute()
        .data
    )

    return {
        "date": today,
        "last_night": _or_none(last_night(biometrics, today)),
        "session": session_for_date(session_rows, today),
        "flag": today_flag(activities, daily, today),
    }


def build_week(db, today: date) -> dict:
    """§8.2 Week page — the "Generate check-in" block (v1.28). Scopes every
    query to the two weeks week_checkin() actually needs (this week and
    the previous one, for the ramp) rather than fetching whole tables —
    unlike build_today/build_shin_series, which already read the full
    history for other reasons."""
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    prev_week_start = week_start - timedelta(days=7)

    activities = (
        db.table("activities")
        .select("date,type,distance_km")
        .gte("date", prev_week_start.isoformat())
        .lte("date", week_end.isoformat())
        .execute()
        .data
    )
    daily = (
        db.table("daily")
        .select("date,shin")
        .gte("date", week_start.isoformat())
        .lte("date", week_end.isoformat())
        .execute()
        .data
    )
    biometrics = (
        db.table("biometrics")
        .select("date,sleep_total_min,rhr,hrv_overnight")
        .gte("date", week_start.isoformat())
        .lte("date", week_end.isoformat())
        .execute()
        .data
    )
    sessions = (
        db.table("sessions")
        .select("date,session_type,done")
        .gte("date", week_start.isoformat())
        .lte("date", week_end.isoformat())
        .execute()
        .data
    )
    weekly = (
        db.table("weekly")
        .select("week_start,week,dates_label,planned_km")
        .eq("week_start", week_start.isoformat())
        .execute()
        .data
    )

    return week_checkin(activities, daily, biometrics, sessions, weekly, today)


def main():
    db = get_db()
    today = date.today()

    payload = build_shin_series(db, today)
    out_path = DATA_DIR / "shin_series.json"
    _write_json(out_path, payload)
    print(
        f"wrote {out_path} — coverage "
        f"{payload['coverage']['answered']}/{payload['coverage']['total']}"
    )

    today_payload = build_today(db, today)
    today_out_path = DATA_DIR / "today.json"
    _write_json(today_out_path, today_payload)
    print(f"wrote {today_out_path} — flag: {today_payload['flag']}")

    week_payload = build_week(db, today)
    week_out_path = DATA_DIR / "week.json"
    _write_json(week_out_path, week_payload)
    print(
        f"wrote {week_out_path} — week {week_payload['week_start']}, "
        f"understated_volume: {week_payload['understated_volume']}"
    )


if __name__ == "__main__":
    main()
