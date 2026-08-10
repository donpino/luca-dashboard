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

import json
import os
import sys
from datetime import date
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


def build_shin_series(db, today: date) -> dict:
    daily = fetch_all(db, "daily", "date,shin")
    if not daily:
        start = today
    else:
        start = min(date.fromisoformat(r["date"]) for r in daily)
    activities = fetch_all(db, "activities", "date,type,distance_km")
    return shin_series(activities, daily, start, today)


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
