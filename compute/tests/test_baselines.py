"""rhr_baseline, hrv_baseline — DASHBOARD_SPEC.md §7.

Real biometrics data (live DB, 9 Aug 2026) is a single FR70 row — nowhere
near enough to test the device-break rule (CLAUDE.md rule 5) against real
data, so these fixtures are synthetic, spanning a fake Amazfit -> FR70
break, per the task's explicit instruction.
"""

from datetime import date, timedelta

import pytest

from metrics import InsufficientData, hrv_baseline, rhr_baseline

# statistics.median/median-of-abs-deviations hand-checked for this list:
# sorted: [47,48,48,49,49,50,50,50,51,51,52,52,52,53] (14 values)
# median = average of 7th/8th sorted values = (50+50)/2 = 50.0
# abs deviations from 50.0: [0,2,2,1,1,3,0,3,2,1,0,1,2,2]
# sorted deviations: [0,0,0,1,1,1,1,2,2,2,2,2,3,3]
# MAD = average of 7th/8th = (1+2)/2 = 1.5
RHR_14_VALUES = [50, 52, 48, 51, 49, 53, 50, 47, 52, 51, 50, 49, 48, 52]


def _biometrics_row(d: date, device: str, rhr=None, hrv_overnight=None, hrv_status=None):
    return {
        "date": d.isoformat(),
        "device": device,
        "rhr": rhr,
        "hrv_overnight": hrv_overnight,
        "hrv_status": hrv_status,
    }


def test_rhr_baseline_hand_checked_median_and_mad():
    as_of = date(2025, 2, 14)
    rows = [
        _biometrics_row(as_of - timedelta(days=13 - i), "fr70", rhr=v)
        for i, v in enumerate(RHR_14_VALUES)
    ]
    result = rhr_baseline(rows, as_of)
    assert result["median"] == 50.0
    assert result["mad"] == 1.5
    assert result["n"] == 14
    assert result["device"] == "fr70"


def test_rhr_baseline_never_spans_device_break():
    """Amazfit rows sit inside the 30-day trailing window in calendar terms
    but must be excluded entirely — device break, CLAUDE.md rule 5."""
    as_of = date(2025, 2, 14)
    amazfit_rows = [
        _biometrics_row(date(2025, 1, 1) + timedelta(days=i), "amazfit", rhr=60)
        for i in range(30)  # 2025-01-01 .. 2025-01-30
    ]
    fr70_rows = [
        _biometrics_row(as_of - timedelta(days=13 - i), "fr70", rhr=v)
        for i, v in enumerate(RHR_14_VALUES)
    ]
    result = rhr_baseline(amazfit_rows + fr70_rows, as_of)
    # If the amazfit rows (rhr=60) had leaked into the window, n would be
    # higher than 14 and the median would be pulled toward 60.
    assert result["n"] == 14
    assert result["median"] == 50.0
    assert result["device"] == "fr70"


def test_rhr_baseline_insufficient_below_min_n():
    as_of = date(2025, 2, 14)
    rows = [
        _biometrics_row(as_of - timedelta(days=4 - i), "fr70", rhr=50)
        for i in range(5)  # only 5 days of data
    ]
    result = rhr_baseline(rows, as_of)
    assert isinstance(result, InsufficientData)
    assert result.n == 5
    assert result.required == 14


def test_hrv_baseline_hand_checked_means_and_status_passthrough():
    as_of = date(2025, 3, 25)
    rows = []
    for i in range(25):  # 2025-03-01 .. 2025-03-25
        d = date(2025, 3, 1) + timedelta(days=i)
        status = "NONE" if i == 24 else "BALANCED"
        rows.append(_biometrics_row(d, "fr70", hrv_overnight=60 + i, hrv_status=status))

    # mean_30d: all 25 values, 60..84, arithmetic series -> (60+84)/2 = 72.0
    # mean_7d: last 7 values, days 19..25 -> hrv_overnight 78..84 -> (78+84)/2 = 81.0
    result = hrv_baseline(rows, as_of)
    assert result["mean_30d"] == pytest.approx(72.0)
    assert result["mean_7d"] == pytest.approx(81.0)
    assert result["hrv_status"] == "NONE"  # literal string passed through, never coerced
    assert result["days_elapsed"] == 25


def test_hrv_baseline_insufficient_below_21_days():
    as_of = date(2025, 3, 20)
    rows = [
        _biometrics_row(date(2025, 3, 1) + timedelta(days=i), "fr70", hrv_overnight=60)
        for i in range(20)  # only 20 days on the device
    ]
    result = hrv_baseline(rows, as_of)
    assert isinstance(result, InsufficientData)
    assert result.n == 20
    assert result.required == 21


def test_hrv_baseline_never_spans_device_break():
    as_of = date(2025, 3, 25)
    amazfit_rows = [
        _biometrics_row(date(2025, 1, 1) + timedelta(days=i), "amazfit", hrv_overnight=999)
        for i in range(60)
    ]
    fr70_rows = [
        _biometrics_row(date(2025, 3, 1) + timedelta(days=i), "fr70", hrv_overnight=60 + i)
        for i in range(25)
    ]
    result = hrv_baseline(amazfit_rows + fr70_rows, as_of)
    assert result["days_elapsed"] == 25  # not inflated by the amazfit history
    assert result["mean_30d"] == pytest.approx(72.0)  # not pulled toward 999
