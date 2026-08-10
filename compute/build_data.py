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

from metrics import assert_no_private_keys, shin_series  # noqa: E402

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


if __name__ == "__main__":
    main()
