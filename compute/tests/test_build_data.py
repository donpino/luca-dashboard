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
from metrics import (
    InsufficientData,
    last_night,
    session_for_date,
    shin_series,
    today_flag,
    week_checkin,
)


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


def test_week_payload_json_roundtrip_null_fields_stay_null(tmp_path):
    # No weekly row, no sessions, no biometrics, no daily — every nullable
    # field must survive the round-trip as an explicit null, matching the
    # same discipline as today.json's own roundtrip test above.
    payload = week_checkin([], [], [], [], [], date(2026, 8, 12))
    out_path = tmp_path / "week.json"
    _write_json(out_path, payload)
    written = json.loads(out_path.read_text())

    assert written["week_start"] == "2026-08-10"
    assert written["week_label"] is None
    assert written["planned_km"] is None
    assert written["ramp_pct"] is None
    assert written["wellness"]["shin_max"] is None
    assert written["sessions"][0]["session_type"] is None
    assert written["understated_volume_cutoff"] == "2026-08-08"


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


# --- scores.json (spec §8.1 v1.35) -------------------------------------------


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, _cols):
        return self

    def range(self, lo, hi):
        self._slice = (lo, hi)
        return self

    def execute(self):
        from types import SimpleNamespace

        lo, hi = self._slice
        return SimpleNamespace(data=self.rows[lo : hi + 1])


class _FakeDB:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _FakeQuery(self.tables.get(name, []))


def test_build_scores_locks_ranges_and_passes_the_coordinate_gate(tmp_path):
    from datetime import timedelta

    from build_data import SCORES_START, build_scores

    today = date(2026, 10, 28)
    bio = [
        {"date": (SCORES_START + timedelta(days=i)).isoformat(), "device": "fr70", "hrv_overnight": 50, "rhr": 48,
         "sleep_total_min": 450, "sleep_awake_min": 20, "sleep_deep_min": 70, "sleep_rem_min": 100}
        for i in range((today - SCORES_START).days)
    ]
    payload = build_scores(_FakeDB({"biometrics": bio}), today)
    # flat history -> every z = 0 except sleep -> a real score, not calibrating
    assert payload["recovery"] is not None and payload["recovery_calibrating"] is None
    assert payload["strain"] is None  # no hr_daily rows -> never a fabricated 0
    ranges = payload["ranges"]["recovery"]
    # 28 Oct - 89 days = 31 Jul < 8 Aug -> locked; on 5 Nov the nominal
    # start is 5 Nov - 89 days = 8 Aug, the first scored day -> unlocks.
    assert ranges["90d"]["locked"] is True
    assert ranges["90d"]["unlocks_on"] == date(2026, 11, 5)
    # 30d = 29 Sep..28 Oct, but sync never writes today -> 29 scored days
    assert ranges["30d"]["locked"] is False and ranges["30d"]["stats"]["n"] == 29
    assert ranges["all"]["locked"] is False
    _write_json(tmp_path / "scores.json", payload)  # raises if a coordinate key leaked


def test_build_scores_flags_a_partial_day_without_hiding_it():
    from datetime import timedelta

    from build_data import SCORES_START, build_scores

    today = SCORES_START + timedelta(days=10)
    bio = [
        {"date": (SCORES_START + timedelta(days=i)).isoformat(), "device": "fr70", "hrv_overnight": 50, "rhr": 48,
         "sleep_total_min": 450, "is_partial": i == 10}
        for i in range(11)
    ]
    hr = [{"date": today.isoformat(), "samples": [[1000, 60], [121000, 62]], "is_partial": True}]
    payload = build_scores(_FakeDB({"biometrics": bio, "hr_daily": hr}), today)
    assert payload["partial_dates"] == [today.isoformat()]
    assert payload["series"][-1]["partial"] is True and payload["series"][-2]["partial"] is False
    assert payload["data_through_ms"] == 121000
    assert payload["strain"]["date"] == today  # today's partial strain is shown, labelled


def test_build_days_shows_each_day_as_it_stood(tmp_path):
    # v1.39: a past day's payload never sees a later night, run or answer.
    from datetime import timedelta

    from build_data import SCORES_START, _fetch_scores_inputs, _fetch_today_inputs, build_days

    today = SCORES_START + timedelta(days=10)
    bio = [
        {"date": (SCORES_START + timedelta(days=i)).isoformat(), "device": "fr70", "hrv_overnight": 50 + i, "rhr": 48,
         "sleep_total_min": 450}
        for i in range(10)
    ]
    acts = [
        {"date": (SCORES_START + timedelta(days=2)).isoformat(), "type": "running", "distance_km": 5.0},
        {"date": (SCORES_START + timedelta(days=4)).isoformat(), "type": "running", "distance_km": 8.0},
    ]
    daily = [{"date": (SCORES_START + timedelta(days=5)).isoformat(), "shin": 2, "illness": False}]
    db = _FakeDB({"biometrics": bio, "activities": acts, "daily": daily})
    days = build_days(_fetch_today_inputs(db), _fetch_scores_inputs(db, today), today)

    assert sorted(days) == [SCORES_START + timedelta(days=i) for i in range(10)]  # never today itself
    d3 = days[SCORES_START + timedelta(days=3)]
    # 8 Aug 2026 is a Saturday: the week of day 3 (11 Aug, Tue) starts 10 Aug,
    # so day 2's run (10 Aug) counts and day 4's (12 Aug) not yet
    assert d3["today"]["cards"]["weekly_km"] == 5.0
    assert d3["today"]["last_night"]["hrv_overnight"] == 53
    assert d3["today"]["cards"]["shin_latest"] is None  # answered on day 5, later
    assert d3["scores"]["as_of"] == SCORES_START + timedelta(days=3)
    assert d3["scores"]["series"][-1]["date"] == SCORES_START + timedelta(days=3)
    assert d3["scores"]["sleep"]["date"] == SCORES_START + timedelta(days=3)
    _write_json(tmp_path / "d3.json", d3)  # coordinate gate


def test_metrics_payload_series_weeks_and_no_later_data():
    # v1.41: raw nightly values per day from the FR70 break, None on a
    # night with no row (never 0), weekly km per Monday up to the day.
    from datetime import timedelta

    from build_data import SCORES_START, _metrics_payload

    bio = [
        {"date": (SCORES_START + timedelta(days=i)).isoformat(), "device": "fr70", "hrv_overnight": 50,
         "rhr": 48, "sleep_total_min": 420}
        for i in (0, 1, 3)
    ]
    acts = [
        {"date": (SCORES_START + timedelta(days=2)).isoformat(), "type": "running", "distance_km": 6.0},
        {"date": (SCORES_START + timedelta(days=5)).isoformat(), "type": "running", "distance_km": 9.0},
    ]
    day = SCORES_START + timedelta(days=3)  # 11 Aug, Tue
    p = _metrics_payload({"biometrics": bio, "activities": acts}, day)
    assert [e["hrv"] for e in p["series"]] == [50, 50, None, 50]
    assert p["series"][2]["sleep_min"] is None
    # weeks start Mon 3 Aug (the week holding 8 Aug) and Mon 10 Aug; the
    # 13 Aug run is after `day` and not counted yet
    assert [(w["date"], w["weekly_km"]) for w in p["weeks"]] == [
        (date(2026, 8, 3), 0.0),
        (date(2026, 8, 10), 6.0),
    ]
    assert p["ranges"]["rhr"]["all"]["stats"]["n"] == 3
