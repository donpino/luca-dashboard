"""easy_band_compliance, medio_control, aerobic_efficiency, decoupling —
DASHBOARD_SPEC.md §7, implemented per the v1.6 amendment against
caller-supplied lap data (no `laps` table exists yet — §12's new
Phase 1.5). Every expected value is hand-computed in the comment above
the assertion, not derived by calling the function under test.
"""

import pytest

from metrics import (
    InsufficientData,
    aerobic_efficiency,
    decoupling,
    easy_band_compliance,
    medio_control,
)


def _lap(start_s, duration_s, distance_km, avg_hr=None):
    return {"start_s": start_s, "duration_s": duration_s, "distance_km": distance_km, "avg_hr": avg_hr}


def test_easy_band_compliance_hand_checked():
    run_a = [
        _lap(0, 300, 1.0),      # warm-up, excluded (start_s < 600)
        _lap(300, 300, 1.0),    # warm-up, excluded (start_s < 600)
        _lap(600, 300, 0.9),    # pace 300/0.9   = 333.33 s/km — in band [315,335]
        _lap(900, 300, 1.0),    # pace 300/1.0   = 300.00 s/km — out of band (too fast)
    ]
    run_b = [
        _lap(0, 600, 1.8),      # warm-up, excluded (start_s < 600)
        _lap(600, 310, 0.95),   # pace 310/0.95  = 326.32 s/km — in band
    ]
    # steady km: 0.9 + 1.0 + 0.95 = 2.85 ; in-band km: 0.9 + 0.95 = 1.85
    # compliance = 1.85 / 2.85 * 100 = 64.91228070175438
    result = easy_band_compliance([run_a, run_b])
    assert result == pytest.approx(64.91228070175438)


def test_easy_band_compliance_insufficient_when_all_warmup():
    run = [_lap(0, 300, 1.0), _lap(300, 300, 1.0)]  # both laps start before 600s
    assert isinstance(easy_band_compliance([run]), InsufficientData)


def test_medio_control_hand_checked_in_band_not_raced():
    laps = [
        _lap(0, 230, 1.0),  # pace 230 s/km
        _lap(230, 235, 1.0),  # pace 235 s/km
        _lap(465, 245, 1.0),  # pace 245 s/km
    ]
    # mean pace = (230 + 235 + 245) / 3 = 710 / 3 = 236.666...  s/km
    # band is [230, 240] -> in_band True; 236.67 is not < 225 -> raced False
    result = medio_control(laps)
    assert result["mean_pace_s_per_km"] == pytest.approx(710 / 3)
    assert result["in_band"] is True
    assert result["raced"] is False


def test_medio_control_raced_flag():
    laps = [_lap(0, 220, 1.0)]  # pace 220 s/km — faster than the 225 raced threshold
    result = medio_control(laps)
    assert result["mean_pace_s_per_km"] == 220.0
    assert result["in_band"] is False  # 220 < band lower bound 230
    assert result["raced"] is True


def test_medio_control_insufficient_when_no_laps():
    assert isinstance(medio_control([]), InsufficientData)


def test_aerobic_efficiency_hand_checked():
    laps = [
        _lap(600, 300, 1.0, avg_hr=140),
        _lap(900, 300, 1.0, avg_hr=150),
    ]
    # speed = 2000 m / 600 s = 3.3333... m/s
    # avg_hr, duration-weighted = (140*300 + 150*300) / 600 = 145.0
    # efficiency = 3.3333.../145.0 = 0.022988505747126436
    assert aerobic_efficiency(laps) == pytest.approx(0.022988505747126436)


def test_aerobic_efficiency_excludes_warmup():
    laps = [
        _lap(0, 300, 5.0, avg_hr=100),  # would dominate the ratio if not excluded
        _lap(600, 300, 1.0, avg_hr=140),
        _lap(900, 300, 1.0, avg_hr=150),
    ]
    assert aerobic_efficiency(laps) == pytest.approx(0.022988505747126436)


def test_aerobic_efficiency_insufficient_without_hr():
    laps = [_lap(600, 300, 1.0, avg_hr=None)]
    assert isinstance(aerobic_efficiency(laps), InsufficientData)


def test_decoupling_hand_checked():
    laps = [
        _lap(600, 300, 1.0, avg_hr=140),
        _lap(900, 300, 1.0, avg_hr=142),
        _lap(1200, 300, 0.95, avg_hr=150),
        _lap(1500, 300, 0.9, avg_hr=155),
    ]
    # total steady duration = 1200s, half = 600s
    # lap midpoints: 150, 450, 750, 1050 -> first two laps in first half (<=600),
    # last two in second half
    # first half:  speed = 2000/600 = 3.3333...; hr = (140*300+142*300)/600 = 141.0
    #              ae_first  = 3.3333.../141.0 = 0.02364066193853428
    # second half: speed = 1850/600 = 3.08333...; hr = (150*300+155*300)/600 = 152.5
    #              ae_second = 3.08333.../152.5  = 0.020218579234972677
    # decoupling = ae_second / ae_first = 0.8552459016393442
    assert decoupling(laps) == pytest.approx(0.8552459016393442)


def test_decoupling_insufficient_with_fewer_than_two_steady_laps():
    laps = [_lap(0, 300, 1.0, avg_hr=140), _lap(600, 300, 1.0, avg_hr=140)]
    assert isinstance(decoupling(laps), InsufficientData)
