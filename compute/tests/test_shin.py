"""shin_series, impact_mechanics — DASHBOARD_SPEC.md §7.

The test the task calls out explicitly: a day with no daily row (or an
explicit NULL shin, which is indistinguishable in this schema — §8.5's
Save button is disabled until shin is answered, so a saved row always
has a non-null shin) must never render as shin = 0 (CLAUDE.md rule 12,
DASHBOARD_SPEC.md §5's null rule).
"""

from datetime import date

from metrics import impact_mechanics, shin_series


def _daily(d: str, shin):
    return {"date": d, "shin": shin}


def _run(d: str, avg_cadence=None, avg_vertical_oscillation=None, avg_vertical_ratio=None):
    return {
        "date": d,
        "type": "running",
        "avg_cadence": avg_cadence,
        "avg_vertical_oscillation": avg_vertical_oscillation,
        "avg_vertical_ratio": avg_vertical_ratio,
    }


def test_shin_series_null_day_is_none_not_zero():
    daily = [_daily("2026-08-08", 1), _daily("2026-08-10", 0)]
    activities: list[dict] = []
    result = shin_series(activities, daily, date(2026, 8, 8), date(2026, 8, 11))
    by_date = {row["date"]: row["shin"] for row in result["series"]}

    assert by_date[date(2026, 8, 8)] == 1
    # 2026-08-09 has no daily row at all — must be None, never 0
    assert by_date[date(2026, 8, 9)] is None
    # 2026-08-10 was actually answered "0" (assessed, no pain) — must stay 0, not be dropped
    assert by_date[date(2026, 8, 10)] == 0
    # 2026-08-11 also has no row — None again
    assert by_date[date(2026, 8, 11)] is None


def test_shin_series_coverage_counts_only_answered_days():
    daily = [_daily("2026-08-08", 2)]
    result = shin_series([], daily, date(2026, 8, 8), date(2026, 8, 14))
    # range is 7 days (8th..14th inclusive), only one answered
    assert result["coverage"] == {"answered": 1, "total": 7}


def test_shin_series_zero_is_not_coerced_from_or_to_none():
    """A run of all-zero (assessed, no pain) days must report full coverage,
    proving 0 is never silently treated as unanswered either."""
    daily = [_daily(f"2026-08-{d:02d}", 0) for d in range(8, 12)]
    result = shin_series([], daily, date(2026, 8, 8), date(2026, 8, 11))
    assert result["coverage"] == {"answered": 4, "total": 4}
    assert all(row["shin"] == 0 for row in result["series"])


def test_shin_series_band_classification_hand_checked():
    """§10's third marker state: shin=0 is in_band, 1-3 is out_of_band,
    no daily row is not_answered — never derived by the frontend."""
    daily = [
        _daily("2026-08-08", 0),
        _daily("2026-08-09", 1),
        _daily("2026-08-10", 2),
        _daily("2026-08-11", 3),
        # 2026-08-12 has no row at all
    ]
    result = shin_series([], daily, date(2026, 8, 8), date(2026, 8, 12))
    band_by_date = {row["date"]: row["band"] for row in result["series"]}
    assert band_by_date[date(2026, 8, 8)] == "in_band"
    assert band_by_date[date(2026, 8, 9)] == "out_of_band"
    assert band_by_date[date(2026, 8, 10)] == "out_of_band"
    assert band_by_date[date(2026, 8, 11)] == "out_of_band"
    assert band_by_date[date(2026, 8, 12)] == "not_answered"


def test_shin_series_understated_volume_flag_hand_checked():
    """§8.3/v1.7: any point before 2026-08-08 is a floor, not a
    measurement, and must be marked so the render layer never has to
    hardcode the cutoff date itself."""
    result = shin_series([], [], date(2026, 8, 6), date(2026, 8, 9))
    understated_by_date = {row["date"]: row["understated_volume"] for row in result["series"]}
    assert understated_by_date[date(2026, 8, 6)] is True
    assert understated_by_date[date(2026, 8, 7)] is True
    assert understated_by_date[date(2026, 8, 8)] is False  # the cutoff itself is not understated
    assert understated_by_date[date(2026, 8, 9)] is False


def test_impact_mechanics_joins_shin_plus1_plus2_preserving_null():
    activities = [_run("2026-08-08", avg_cadence=170, avg_vertical_oscillation=9.3, avg_vertical_ratio=8.4)]
    daily = [_daily("2026-08-10", 2)]  # date+2 answered; date+1 (08-09) has no row
    [result] = impact_mechanics(activities, daily)
    assert result["avg_cadence"] == 170
    assert result["shin_plus1"] is None
    assert result["shin_plus2"] == 2


def test_impact_mechanics_excludes_cycling():
    activities = [
        _run("2026-08-08", avg_cadence=170),
        {"date": "2026-08-08", "type": "cycling", "avg_cadence": 90},
    ]
    result = impact_mechanics(activities, [])
    assert len(result) == 1
    assert result[0]["avg_cadence"] == 170
