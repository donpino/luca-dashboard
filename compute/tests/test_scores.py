"""recovery, strain, sleep_score — DASHBOARD_SPEC.md §7, v1.35 (sleep v1.37).

Synthetic fixtures; every expected value is worked by hand in the comment
above its assertion.
"""

import math
from datetime import date, datetime, timedelta

import pytest

from metrics import (
    InsufficientData,
    personal_baseline,
    recovery,
    recovery_band,
    sleep_consistency,
    sleep_need_hours,
    sleep_score,
    strain,
)

D = date(2026, 10, 27)


def _bio(d, device="fr70", **kw):
    return {"date": d.isoformat(), "device": device, **kw}


# --- personal_baseline ------------------------------------------------------


def test_baseline_below_min_n_is_insufficient():
    result = personal_baseline([50, 51, 52], floor=2.0)
    assert isinstance(result, InsufficientData)
    assert result.n == 3 and result.required == 4


def test_baseline_spread_floor():
    # mean 50; |dev| = 2,0,2,0 -> mean abs dev 1.0, below the 2.0 floor
    # -> sigma = 1.253 * 2.0 = 2.506
    result = personal_baseline([48, 50, 52, 50], floor=2.0)
    assert result["mean"] == 50
    assert result["sigma"] == pytest.approx(2.506)
    assert result["trusted"] is False


# --- recovery ---------------------------------------------------------------


def _flat_history(**today):
    """10 prior nights at HRV 50 / RHR 48, plus tonight's row."""
    rows = [_bio(D - timedelta(days=i), hrv_overnight=50, rhr=48) for i in range(1, 11)]
    return rows + [_bio(D, **today)]


def test_recovery_at_baseline_reads_58():
    # every z = 0 -> 100 / (1 + e^(-1.6 * 0.2)) = 100 / 1.726149 = 57.93
    rows = _flat_history(hrv_overnight=50, rhr=48)
    result = recovery(rows, D, InsufficientData("no sleep"), {})
    assert result["score"] == pytest.approx(57.93, abs=0.01)
    assert result["band"] == "yellow"


def test_recovery_hrv_one_sigma_up():
    # Flat history -> ln-HRV spread 0, floored at 0.08 -> sigma 0.10024.
    # Tonight ln-HRV one sigma up: z_hrv = 1, z_rhr = 0, no other terms.
    # composite = 0.55 * 1 / (0.55 + 0.20) = 0.73333
    # score = 100 / (1 + e^(-1.6 * 0.93333)) = 100 / 1.224623 = 81.66
    tonight = 50 * math.exp(1.253 * 0.08)
    rows = _flat_history(hrv_overnight=tonight, rhr=48)
    result = recovery(rows, D, InsufficientData("no sleep"), {})
    assert result["z"]["hrv"] == pytest.approx(1.0)
    assert result["score"] == pytest.approx(81.66, abs=0.01)
    assert result["band"] == "green"


def test_recovery_needs_hrv_baseline_and_never_spans_device_break():
    # 10 Amazfit nights are on the calendar but not on the current device.
    amazfit = [_bio(D - timedelta(days=i), device="amazfit", hrv_overnight=50, rhr=48) for i in range(1, 11)]
    result = recovery(amazfit + [_bio(D, hrv_overnight=50, rhr=48)], D, InsufficientData("x"), {})
    assert isinstance(result, InsufficientData)
    assert result.n == 0 and result.required == 4


def test_recovery_null_hrv_is_insufficient_not_zero():
    result = recovery(_flat_history(hrv_overnight=None, rhr=48), D, InsufficientData("x"), {})
    assert isinstance(result, InsufficientData)


def test_recovery_bands():
    assert recovery_band(33.9) == "red"
    assert recovery_band(34.0) == "yellow"
    assert recovery_band(66.9) == "yellow"
    assert recovery_band(67.0) == "green"


# --- strain -----------------------------------------------------------------

# rhr 50, HR_MAX 201 -> reserve 151. Banister, sedentary floor 20% HRR:
# floor rate = 0.20 * 0.64 * e^0.384 = 0.128 * 1.468145 = 0.187923 /min
# D = 1440 * (0.64 * e^1.92 - 0.187918) + 1 = 1440 * (4.365413 - 0.187923) + 1 = 6016.59
# ln D = 8.702277
# 150 bpm: x = 100/151 = 0.662252, rate = 0.423841 * e^1.271523 = 1.511538 -> net 1.323615
# 180 bpm: x = 130/151 = 0.860927, rate = 0.550993 * e^1.652980 = 2.877573 -> net 2.689650
# 60 bpm: x = 0.066 -> below the floor -> 0
S = 1_761_580_800_000  # an epoch-ms activity start


def _run(stream=True):
    activity = {"id": 1, "start_ts": S, "duration_s": 600}
    streams = {1: [[S + i * 1000, 150] for i in range(601)]} if stream else {}
    return activity, streams


ALL_DAY = {"samples": [[S - 120_000, 60], [S + 60_000, 180], [S + 720_000, 60]]}


def test_strain_constants_hand_checked():
    from metrics import SEDENTARY_RATE, STRAIN_DENOMINATOR

    assert SEDENTARY_RATE == pytest.approx(0.187923, abs=1e-6)
    assert STRAIN_DENOMINATOR == pytest.approx(6016.59, abs=0.01)


def test_strain_activity_stream_replaces_all_day_inside_window():
    # Activity: 10 min at net 1.323615 -> TRIMP 13.2362.
    # All-day: the 180-bpm sample sits inside the window and is dropped;
    # the remaining two are 60 bpm, below the floor -> 0.
    # strain = 21 * ln(14.2362) / 8.702277 = 21 * 2.655787 / 8.702277 = 6.409
    activity, streams = _run()
    result = strain(D, ALL_DAY, [activity], streams, rhr=50)
    assert result["trimp"] == pytest.approx(13.2362, abs=1e-3)
    assert result["rest_of_day_trimp"] == 0
    assert result["activity_share"] == 1.0
    assert result["strain"] == pytest.approx(6.409, abs=0.001)


def test_strain_without_stream_falls_back_on_all_day():
    # No stream -> no window -> the 180-bpm sample counts for
    # min(660 s, 120 s cap) = 2 min at net 2.689650 -> TRIMP 5.37930.
    # strain = 21 * ln(6.37931) / 8.702277 = 21 * 1.853060 / 8.702277 = 4.472
    activity, streams = _run(stream=False)
    result = strain(D, ALL_DAY, [activity], streams, rhr=50)
    assert result["trimp"] == pytest.approx(5.37931, abs=1e-4)
    assert result["strain"] == pytest.approx(4.472, abs=0.001)


def test_strain_sedentary_floor_nets_to_zero():
    # exactly 20% HRR = 50 + 0.2 * 151 = 80.2 bpm -> rate == floor -> 0
    day = {"samples": [[0, 80.2], [120_000, 60]]}
    assert strain(D, day, [], {}, rhr=50)["trimp"] == pytest.approx(0.0, abs=1e-9)


def test_strain_insufficient_without_all_day_hr_or_rhr():
    assert isinstance(strain(D, None, [], {}, rhr=50), InsufficientData)
    assert isinstance(strain(D, ALL_DAY, [], {}, rhr=None), InsufficientData)


# --- sleep_score -------------------------------------------------------------


def test_sleep_need_is_p75_floored_and_capped():
    # sorted hours [7,7,7,7,8,9,9,10], p75 at index 5.25 -> 9 + 0.25*0 = 9.0
    rows = [{"sleep_total_min": h * 60} for h in (7, 9, 7, 10, 7, 8, 9, 7)]
    assert sleep_need_hours(rows) == pytest.approx(9.0)
    assert sleep_need_hours([{"sleep_total_min": 600}] * 8) == 9.5
    assert sleep_need_hours([{"sleep_total_min": 300}] * 3) == 8.0  # < 7 nights -> floor


def test_sleep_consistency_hand_checked():
    # starts 23:00, 23:30, 00:00 -> 660, 690, 720 min after noon;
    # pstdev = sqrt((900 + 0 + 900) / 3) = 24.495. Ends all 07:00 -> 0.
    # mean SD 12.247 -> 1 - 12.247 / 90 = 0.86392
    rows = [
        {"sleep_start_local": f"2026-10-2{i}T{s}", "sleep_end_local": f"2026-10-2{i + 1}T07:00:00"}
        for i, s in ((4, "23:00:00"), (5, "23:30:00"), (6, "00:00:00"))
    ]
    assert sleep_consistency(rows) == pytest.approx(0.86392, abs=1e-4)
    assert sleep_consistency(rows[:2]) is None


def test_sleep_score_without_history_or_window_renormalizes():
    # No prior nights -> no deep/REM/HRV/RHR part (personal baseline needs
    # 4) and no consistency. duration 420/480 = 0.875; efficiency
    # 420/450 = 0.93333. (0.35*0.875 + 0.10*0.93333) / 0.45
    # = 0.399583 / 0.45 = 88.80
    rows = [_bio(D, sleep_total_min=420, sleep_awake_min=30, sleep_deep_min=70, sleep_rem_min=105)]
    result = sleep_score(rows, D)
    assert result["need_hours"] == 8.0
    assert set(result["parts"]) == {"duration", "efficiency"}
    assert result["score"] == pytest.approx(88.80, abs=0.01)
    assert result["behavioural_score"] == pytest.approx(88.80, abs=0.01)
    assert result["weights"] == pytest.approx({"duration": 0.35 / 0.45, "efficiency": 0.10 / 0.45})


def _night(d, **kw):
    base = dict(sleep_total_min=420, sleep_awake_min=30, sleep_deep_min=100, sleep_rem_min=90, hrv_overnight=50, rhr=48)
    return _bio(d, **{**base, **kw})


def test_sleep_score_night_at_own_mean():
    # 10 identical prior nights, tonight the same: every personal part has
    # z = 0 -> 1 / (1 + e^(-1.6 * 0.2)) = 0.579324.
    # score: 0.35*0.875 + 0.10*0.93333 + (0.10+0.10+0.15+0.10)*0.579324
    #      = 0.399583 + 0.260696 = 0.660279, / 0.90 = 73.36
    # behavioural (no HRV/RHR): 0.399583 + 0.20*0.579324 = 0.515448,
    #      / 0.65 = 79.30
    rows = [_night(D - timedelta(days=i)) for i in range(1, 11)] + [_night(D)]
    result = sleep_score(rows, D)
    for k in ("deep", "rem", "hrv", "rhr"):
        assert result["parts"][k] == pytest.approx(0.579324, abs=1e-5)
    assert result["score"] == pytest.approx(73.36, abs=0.01)
    assert result["behavioural_score"] == pytest.approx(79.30, abs=0.01)
    assert result["inputs"]["hrv"] == pytest.approx({"value": 50, "baseline": 50})


def test_sleep_score_lower_rhr_is_better():
    # prior RHR all 48 -> MAD 0, floor 2 -> sigma 2.506. Tonight 46:
    # z = 2 / 2.506 = 0.798085 -> 1 / (1 + e^(-1.6 * 0.998085)) = 0.831590
    rows = [_night(D - timedelta(days=i)) for i in range(1, 5)] + [_night(D, rhr=46)]
    assert sleep_score(rows, D)["parts"]["rhr"] == pytest.approx(0.831590, abs=1e-5)


def test_sleep_score_baseline_is_whole_device_history():
    # v1.37: the four FR70 nights 35-38 days back sit outside a 30-day
    # window but still count, so deep has a baseline (z = 0 -> 0.579324).
    # The Amazfit nights before them are a different sensor (rule 5): were
    # they included, mean deep would be 200 and tonight would read low.
    amazfit = [_night(D - timedelta(days=i), device="amazfit", sleep_deep_min=300) for i in range(40, 50)]
    fr70 = [_night(D - timedelta(days=i)) for i in range(35, 39)]
    result = sleep_score(amazfit + fr70 + [_night(D)], D)
    assert result["parts"]["deep"] == pytest.approx(0.579324, abs=1e-5)
    assert result["inputs"]["deep"]["baseline"] == 100


def test_sleep_score_null_sleep_is_insufficient():
    assert isinstance(sleep_score([_bio(D, sleep_total_min=None)], D), InsufficientData)


# --- score_series / range_stats ----------------------------------------------


def test_score_series_feeds_prior_day_strain_into_recovery():
    from metrics import score_series

    # 10 flat nights, then D. Strain exists on D-1 only and matches nothing
    # in a baseline (only 1 value < 4) -> prior_strain term absent, so the
    # series' recovery for D equals the stand-alone call.
    rows = _flat_history(hrv_overnight=50, rhr=48)
    hr = [{"date": (D - timedelta(days=1)).isoformat(), "samples": [[0, 60], [120_000, 60]]}]
    series = score_series(rows, hr, [], {}, D - timedelta(days=1), D)
    assert [e["date"] for e in series] == [D - timedelta(days=1), D]
    assert series[0]["strain"]["strain"] == 0.0  # zone 0 all day -> ln(1) = 0
    assert series[0]["strain"]["activity_share"] is None  # 0 load -> no share, not 0/0
    assert "prior_strain" not in series[1]["recovery"]["z"]
    assert isinstance(series[1]["strain"], InsufficientData)  # no all-day HR on D


def test_range_stats_and_delta():
    from metrics import range_stats

    # range 3 days: [4, 6, 8] -> mean 6, min 4, max 8;
    # preceding 3 days: [1, 2, 3] -> mean 2 -> delta +4
    vals = [(D - timedelta(days=5 - i), v) for i, v in enumerate([1, 2, 3, 4, 6, 8])]
    stats = range_stats(vals, D - timedelta(days=2), D)
    assert stats == {"mean": 6, "min": 4, "max": 8, "n": 3, "delta": 4}
    assert range_stats(vals, D + timedelta(days=1), D + timedelta(days=3)) is None


def test_recovery_reports_inputs_against_baseline():
    # history RHR 48 -> baseline mean 48; tonight 46 -> value 46.
    # HRV baseline = exp(mean ln 50) = 50.
    rows = _flat_history(hrv_overnight=50, rhr=46)
    result = recovery(rows, D, InsufficientData("x"), {})
    assert result["inputs"]["rhr"] == {"value": 46, "baseline": 48}
    assert result["inputs"]["hrv"]["baseline"] == pytest.approx(50)
    assert result["weights"] == pytest.approx({"hrv": 0.55 / 0.75, "rhr": 0.20 / 0.75})


def test_recovery_sleep_term_is_against_own_sleep_history():
    # v1.37. Prior behavioural sleep scores 70, 72, 68, 70 -> mean 70,
    # MAD 1.0 below the 5-point floor -> sigma 1.253 * 5 = 6.265.
    # Tonight 76.265 -> z = 6.265 / 6.265 = 1.0 exactly.
    rows = _flat_history(hrv_overnight=50, rhr=48)
    history = {D - timedelta(days=i): v for i, v in zip(range(1, 5), (70, 72, 68, 70))}
    sleep = {"score": 60.0, "behavioural_score": 76.265}
    result = recovery(rows, D, sleep, {}, history)
    assert result["z"]["sleep"] == pytest.approx(1.0, abs=1e-6)
    assert result["inputs"]["sleep"] == {"value": 76.265, "baseline": 70}


def test_recovery_sleep_term_absent_below_four_prior_scores():
    rows = _flat_history(hrv_overnight=50, rhr=48)
    sleep = {"score": 60.0, "behavioural_score": 76.0}
    result = recovery(rows, D, sleep, {}, {D - timedelta(days=1): 70})
    assert "sleep" not in result["z"]
