"""build_data.py — the headless driver that writes web/public/data/*.json.

Covers the two things metrics.py's own pure-function tests can't: that a
null shin survives an actual JSON encode/decode round-trip (not just a
Python dict), and that the coordinate-stripping gate (CLAUDE.md rule 1)
is actually wired into the write path, not just defined in metrics.py.
"""

import json
from datetime import date

import pytest

from build_data import DATA_START, _or_none, _range_coverage, _range_start, _write_json
from metrics import InsufficientData, last_night, session_for_date, shin_series, today_flag


def test_range_start_day_based_ranges_are_trailing_n_days_ending_today():
    # Spec v1.18: §9's 7d/30d/90d options are trailing N-day windows
    # ending at `today`, same convention v1.17 used for the (now removed)
    # single fixed 90-day emission window.
    today = date(2026, 8, 10)
    floor = date(2023, 5, 13)
    assert _range_start("7d", today, floor) == date(2026, 8, 4)
    assert _range_start("30d", today, floor) == date(2026, 7, 12)
    assert _range_start("90d", today, floor) == date(2026, 5, 13)


def test_range_start_month_based_ranges_shift_calendar_months():
    today = date(2026, 8, 10)
    floor = date(2023, 5, 13)
    assert _range_start("6m", today, floor) == date(2026, 2, 10)
    assert _range_start("1y", today, floor) == date(2025, 8, 10)


def test_range_start_all_is_the_floor():
    today = date(2026, 8, 10)
    assert _range_start("all", today, DATA_START) == DATA_START


def test_range_start_never_precedes_floor_even_for_wide_ranges():
    # A range nominally wider than the emitted series (e.g. "1y" soon
    # after DATA_START) clamps up to the floor rather than pointing
    # before the first plotted day.
    today = date(2023, 6, 1)
    floor = date(2023, 5, 13)
    assert _range_start("1y", today, floor) == floor


def test_range_coverage_counts_only_rows_inside_the_window():
    series = [
        {"date": date(2026, 8, 8), "shin": 1},
        {"date": date(2026, 8, 9), "shin": None},
        {"date": date(2026, 8, 10), "shin": 0},
    ]
    assert _range_coverage(series, date(2026, 8, 9), date(2026, 8, 10)) == {
        "answered": 1,
        "total": 2,
    }


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


def test_or_none_converts_insufficient_data_to_none():
    assert _or_none(InsufficientData(reason="no rows")) is None


def test_or_none_passes_a_real_value_through_unchanged():
    assert _or_none({"rhr": 44}) == {"rhr": 44}


def test_today_payload_json_roundtrip_all_three_panels_null_safe(tmp_path):
    # Mirrors build_today()'s own dict shape without touching Supabase —
    # no biometrics, no sessions row, nothing that qualifies as a flag.
    # Every panel key must still be present and explicitly null, never
    # dropped (same null-vs-missing-key discipline as shin's own
    # roundtrip test above).
    today = date(2026, 8, 13)
    payload = {
        "date": today,
        "last_night": _or_none(last_night([], today)),
        "session": session_for_date([], today),
        "flag": today_flag([], [], today),
    }
    out_path = tmp_path / "today.json"
    _write_json(out_path, payload)
    written = json.loads(out_path.read_text())

    assert written["date"] == "2026-08-13"
    assert "last_night" in written and written["last_night"] is None
    assert "session" in written and written["session"] is None
    assert "flag" in written and written["flag"] is None


def test_today_payload_json_roundtrip_carries_real_values(tmp_path):
    today = date(2026, 8, 13)
    biometrics = [
        {
            "date": "2026-08-13",
            "device": "fr70",
            "sleep_total_min": 410,
            "rhr": 45,
            "hrv_overnight": None,  # must survive as null, not 0 or dropped
        }
    ]
    daily = [{"date": "2026-08-13", "shin": 1, "illness": None}]
    sessions = [
        {
            "date": "2026-08-13",
            "session_type": "Medio",
            "purpose": "tempo control",
            "prescription": "6km @ 3:50-4:00/km",
            "done": "Pending",
        }
    ]
    payload = {
        "date": today,
        "last_night": _or_none(last_night(biometrics, today)),
        "session": session_for_date(sessions, today),
        "flag": today_flag([], daily, today),
    }
    out_path = tmp_path / "today.json"
    _write_json(out_path, payload)
    written = json.loads(out_path.read_text())

    assert written["last_night"]["rhr"] == 45
    assert written["last_night"]["hrv_overnight"] is None
    assert written["session"]["session_type"] == "Medio"
    assert written["flag"] == {"kind": "shin", "date": "2026-08-13", "shin": 1}


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
