"""last_night, session_for_date, today_flag — DASHBOARD_SPEC.md §8.1, v1.26.

Every expected value below is hand-checked in the test's own comment, not
just re-derived from calling the function under test.
"""

from datetime import date

from metrics import InsufficientData, last_night, session_for_date, today_flag


def _bio(d: str, device: str, sleep=None, rhr=None, hrv=None) -> dict:
    return {
        "date": d,
        "device": device,
        "sleep_total_min": sleep,
        "rhr": rhr,
        "hrv_overnight": hrv,
    }


def _daily(d: str, shin=None, illness=None) -> dict:
    return {"date": d, "shin": shin, "illness": illness}


def _run(d: str, km: float) -> dict:
    return {"date": d, "type": "running", "distance_km": km}


# ---------------------------------------------------------------------------
# last_night
# ---------------------------------------------------------------------------


def test_last_night_reads_the_most_recent_row():
    biometrics = [
        _bio("2026-08-08", "fr70", sleep=420, rhr=44, hrv=52),
        _bio("2026-08-09", "fr70", sleep=400, rhr=46, hrv=50),
    ]
    result = last_night(biometrics, date(2026, 8, 9))
    assert result["date"] == date(2026, 8, 9)
    assert result["sleep_total_min"] == 400
    assert result["rhr"] == 46
    assert result["hrv_overnight"] == 50
    assert result["device"] == "fr70"


def test_last_night_values_never_cross_the_device_break():
    # CLAUDE.md rule 5 — nothing averages, or even lists, across the break.
    biometrics = [
        _bio("2026-08-01", "amazfit", sleep=410, rhr=43, hrv=90),
        _bio("2026-08-07", "amazfit", sleep=415, rhr=44, hrv=88),
        _bio("2026-08-08", "fr70", sleep=420, rhr=48, hrv=52),
        _bio("2026-08-09", "fr70", sleep=400, rhr=46, hrv=50),
    ]
    result = last_night(biometrics, date(2026, 8, 9))
    dates_in_values = {row["date"] for row in result["values"]}
    assert dates_in_values == {date(2026, 8, 8), date(2026, 8, 9)}
    assert result["device_since"] == date(2026, 8, 8)


def test_last_night_band_possible_from_is_first_device_date_plus_20_days():
    # HRV_BASELINE_MIN_DAYS = 21 elapsed days, same convention as
    # hrv_baseline's own days_elapsed: first_date + (21 - 1) days.
    biometrics = [_bio("2026-08-08", "fr70", sleep=420, rhr=44, hrv=52)]
    result = last_night(biometrics, date(2026, 8, 8))
    assert result["band_possible_from"] == date(2026, 8, 28)


def test_last_night_no_rows_is_insufficient_data():
    result = last_night([], date(2026, 8, 9))
    assert isinstance(result, InsufficientData)


def test_last_night_preserves_null_values_distinctly():
    biometrics = [_bio("2026-08-08", "fr70", sleep=None, rhr=44, hrv=None)]
    result = last_night(biometrics, date(2026, 8, 8))
    assert result["sleep_total_min"] is None
    assert result["hrv_overnight"] is None
    assert result["rhr"] == 44


# ---------------------------------------------------------------------------
# session_for_date
# ---------------------------------------------------------------------------


def test_session_for_date_finds_the_matching_row():
    sessions = [
        {
            "date": "2026-08-12",
            "session_type": "Easy Run",
            "purpose": "aerobic base",
            "prescription": "40 min easy",
            "done": "Yes",
            "note": "felt fine",
        },
        {
            "date": "2026-08-13",
            "session_type": "Medio",
            "purpose": "tempo control",
            "prescription": "6km @ 3:50-4:00/km",
            "done": "Pending",
        },
    ]
    result = session_for_date(sessions, date(2026, 8, 13))
    assert result == {
        "session_type": "Medio",
        "purpose": "tempo control",
        "prescription": "6km @ 3:50-4:00/km",
        "done": "Pending",
    }


def test_session_for_date_no_row_is_none_not_an_error():
    result = session_for_date([], date(2026, 8, 13))
    assert result is None


# ---------------------------------------------------------------------------
# today_flag
# ---------------------------------------------------------------------------


def test_today_flag_absent_when_nothing_qualifies():
    daily = [_daily("2026-08-13", shin=0, illness=False)]
    activities = [_run("2026-08-06", 5.0), _run("2026-08-07", 5.0)]
    assert today_flag(activities, daily, date(2026, 8, 13)) is None


def test_today_flag_null_shin_never_triggers():
    daily = [_daily("2026-08-13", shin=None), _daily("2026-08-12", shin=None)]
    assert today_flag([], daily, date(2026, 8, 13)) is None


def test_today_flag_shin_today_takes_priority():
    daily = [_daily("2026-08-13", shin=1)]
    result = today_flag([], daily, date(2026, 8, 13))
    assert result == {"kind": "shin", "date": date(2026, 8, 13), "shin": 1}


def test_today_flag_shin_yesterday_is_checked_when_today_is_null_or_zero():
    daily = [_daily("2026-08-13", shin=0), _daily("2026-08-12", shin=2)]
    result = today_flag([], daily, date(2026, 8, 13))
    assert result == {"kind": "shin", "date": date(2026, 8, 12), "shin": 2}


def test_today_flag_shin_zero_is_not_a_hit():
    daily = [_daily("2026-08-13", shin=0), _daily("2026-08-12", shin=0)]
    assert today_flag([], daily, date(2026, 8, 13)) is None


def test_today_flag_shin_outranks_illness_and_ramp():
    daily = [_daily("2026-08-13", shin=1, illness=True)]
    activities = [_run("2026-08-07", 20.0)]  # would also flag as a big ramp
    result = today_flag(activities, daily, date(2026, 8, 13))
    assert result["kind"] == "shin"


def test_today_flag_illness_today():
    daily = [_daily("2026-08-13", shin=0, illness=True)]
    result = today_flag([], daily, date(2026, 8, 13))
    assert result == {"kind": "illness", "date": date(2026, 8, 13)}


def test_today_flag_illness_yesterday():
    daily = [_daily("2026-08-13", shin=0, illness=False), _daily("2026-08-12", illness=True)]
    result = today_flag([], daily, date(2026, 8, 13))
    assert result == {"kind": "illness", "date": date(2026, 8, 12)}


def test_today_flag_illness_false_is_not_a_hit():
    daily = [_daily("2026-08-13", illness=False), _daily("2026-08-12", illness=False)]
    assert today_flag([], daily, date(2026, 8, 13)) is None


def test_today_flag_volume_ramp_over_threshold():
    # today = 2026-08-13. completed_end = 2026-08-12 (yesterday).
    # current 7d window: 2026-08-06..2026-08-12 -> 5+5+5+5+5 = 25.0 km
    # (five runs of 5km on 06,07,08,09,10)
    # prev 7d window: 2026-07-30..2026-08-05 -> 20.0 km (four runs of 5km)
    # pct = (25 - 20) / 20 = 0.25 -> > 0.10, flags
    activities = [
        _run("2026-07-30", 5.0),
        _run("2026-07-31", 5.0),
        _run("2026-08-01", 5.0),
        _run("2026-08-02", 5.0),
        _run("2026-08-06", 5.0),
        _run("2026-08-07", 5.0),
        _run("2026-08-08", 5.0),
        _run("2026-08-09", 5.0),
        _run("2026-08-10", 5.0),
    ]
    result = today_flag(activities, [], date(2026, 8, 13))
    assert result == {
        "kind": "volume_ramp",
        "window_end": date(2026, 8, 12),
        "current_7d_km": 25.0,
        "prev_7d_km": 20.0,
        "pct": 0.25,
    }


def test_today_flag_volume_ramp_excludes_todays_activity_never_projects():
    # An activity dated *today* must not affect the completed-window sum —
    # the window ends yesterday, never today (§8.1 v1.26: "never project").
    activities = [_run("2026-08-13", 999.0)]
    result = today_flag(activities, [], date(2026, 8, 13))
    assert result is None  # prev_7d_km is 0 -> InsufficientData -> no flag


def test_today_flag_volume_ramp_at_or_below_threshold_does_not_flag():
    # current = 22, prev = 20 -> pct = 0.10 exactly, not "more than" 10%
    activities = [
        _run("2026-07-30", 5.0),
        _run("2026-07-31", 5.0),
        _run("2026-08-01", 5.0),
        _run("2026-08-02", 5.0),
        _run("2026-08-06", 5.5),
        _run("2026-08-07", 5.5),
        _run("2026-08-08", 5.5),
        _run("2026-08-09", 5.5),
    ]
    result = today_flag(activities, [], date(2026, 8, 13))
    assert result is None
