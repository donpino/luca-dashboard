"""build_data.py — the headless driver that writes web/public/data/*.json.

Covers the two things metrics.py's own pure-function tests can't: that a
null shin survives an actual JSON encode/decode round-trip (not just a
Python dict), and that the coordinate-stripping gate (CLAUDE.md rule 1)
is actually wired into the write path, not just defined in metrics.py.
"""

import json
from datetime import date

import pytest

from build_data import _write_json
from metrics import shin_series


def test_shin_series_json_roundtrip_null_shin_stays_null(tmp_path):
    daily = [{"date": "2026-08-08", "shin": 1}]
    payload = shin_series([], daily, date(2026, 8, 8), date(2026, 8, 9))

    out_path = tmp_path / "shin_series.json"
    _write_json(out_path, payload)
    written = json.loads(out_path.read_text())

    by_date = {row["date"]: row for row in written["series"]}
    assert by_date["2026-08-08"]["shin"] == 1
    # 2026-08-09 has no daily row — must survive the JSON round-trip as
    # null, never 0 or a dropped key (CLAUDE.md rule 12).
    assert by_date["2026-08-09"]["shin"] is None
    assert "shin" in by_date["2026-08-09"]
    assert by_date["2026-08-09"]["band"] == "not_answered"


def test_write_json_serialises_dates_as_iso_strings(tmp_path):
    daily = [{"date": "2026-08-08", "shin": 0}]
    payload = shin_series([], daily, date(2026, 8, 8), date(2026, 8, 8))

    out_path = tmp_path / "shin_series.json"
    _write_json(out_path, payload)
    written = json.loads(out_path.read_text())

    assert written["series"][0]["date"] == "2026-08-08"


def test_write_json_carries_coverage_counts(tmp_path):
    daily = [{"date": "2026-08-08", "shin": 0}]
    payload = shin_series([], daily, date(2026, 8, 8), date(2026, 8, 10))

    out_path = tmp_path / "shin_series.json"
    _write_json(out_path, payload)
    written = json.loads(out_path.read_text())

    assert written["coverage"] == {"answered": 1, "total": 3}


def test_write_json_raises_on_a_leaked_coordinate_key(tmp_path):
    leaked_payload = {
        "series": [{"date": "2026-08-08", "shin": 0, "route": {"startLatitude": 45.07}}],
        "coverage": {"answered": 1, "total": 1},
    }
    out_path = tmp_path / "leaked.json"
    with pytest.raises(ValueError):
        _write_json(out_path, leaked_payload)
    # the gate must abort the write entirely, not write-then-raise
    assert not out_path.exists()
