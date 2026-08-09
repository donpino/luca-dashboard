"""weekly_km, ramp_pct, rolling_7d_km, rolling_28d_km — DASHBOARD_SPEC.md §7.

Every expected value below is hand-summed in the test's own comment, not
just re-derived from calling the function under test.
"""

from datetime import date

from metrics import InsufficientData, ramp_pct, rolling_7d_km, rolling_28d_km, weekly_km


def _run(d: str, km: float, **extra) -> dict:
    return {"date": d, "type": "running", "distance_km": km, **extra}


def _ride(d: str, km: float) -> dict:
    return {"date": d, "type": "cycling", "distance_km": km}


def test_weekly_km_sums_mon_to_sun_running_only():
    activities = [
        _run("2026-01-05", 5.0),   # Mon, in week
        _run("2026-01-07", 3.2),   # Wed, in week
        _run("2026-01-11", 4.8),   # Sun, in week — last day included
        _run("2026-01-12", 6.0),   # Mon next week — excluded
        _ride("2026-01-06", 20.0),  # cycling, in week — excluded (rule 6)
        _run("2026-01-06", None),   # null distance — skipped, not crashed
    ]
    # hand sum: 5.0 + 3.2 + 4.8 = 13.0
    assert weekly_km(activities, date(2026, 1, 5)) == 13.0


def test_cycling_excluded_from_weekly_km():
    """CLAUDE.md rule 6 — 125 real cycling rows exist in the live DB;
    a huge cycling distance in the same week must not leak into weekly_km."""
    activities = [
        _run("2026-01-05", 5.0),
        _run("2026-01-08", 7.0),
        _ride("2026-01-09", 50.0),  # far larger than the running total
    ]
    # hand sum, running only: 5.0 + 7.0 = 12.0 — NOT 62.0
    assert weekly_km(activities, date(2026, 1, 5)) == 12.0


def test_ramp_pct_hand_checked():
    # (22.0 - 20.0) / 20.0 = 0.1 exactly
    assert ramp_pct(22.0, 20.0) == 0.1


def test_ramp_pct_negative_ramp():
    # (18.0 - 20.0) / 20.0 = -0.1
    assert ramp_pct(18.0, 20.0) == -0.1


def test_ramp_pct_zero_prev_is_insufficient_not_zero_or_inf():
    result = ramp_pct(15.0, 0.0)
    assert isinstance(result, InsufficientData)


def test_ramp_pct_missing_prev_is_insufficient():
    result = ramp_pct(15.0, None)
    assert isinstance(result, InsufficientData)


def test_rolling_7d_km_window_and_cycling_exclusion():
    as_of = date(2026, 2, 10)  # window: 2026-02-04 .. 2026-02-10 inclusive
    activities = [
        _run("2026-02-04", 3.0),   # window start, included
        _run("2026-02-06", 4.0),   # included
        _run("2026-02-10", 2.5),   # as_of, included
        _run("2026-02-03", 10.0),  # one day before window — excluded
        _ride("2026-02-05", 50.0),  # cycling in window — excluded
    ]
    # hand sum: 3.0 + 4.0 + 2.5 = 9.5
    assert rolling_7d_km(activities, as_of) == 9.5


def test_rolling_28d_km_window_boundaries():
    as_of = date(2026, 3, 1)  # window: 2026-02-02 .. 2026-03-01 inclusive
    activities = [
        _run("2026-02-01", 5.0),   # one day before window — excluded
        _run("2026-02-02", 6.0),   # window start, included
        _run("2026-02-15", 7.0),   # included
        _run("2026-03-01", 4.0),   # as_of, included
    ]
    # hand sum: 6.0 + 7.0 + 4.0 = 17.0
    assert rolling_28d_km(activities, as_of) == 17.0
