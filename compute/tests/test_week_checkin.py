"""week_checkin — DASHBOARD_SPEC.md §8.2, v1.28.

Every expected value below is hand-checked in the test's own comment, not
just re-derived from calling the function under test.
"""

from datetime import date

from metrics import week_checkin


def _run(d: str, km: float) -> dict:
    return {"date": d, "type": "running", "distance_km": km}


def _daily(d: str, shin=None) -> dict:
    return {"date": d, "shin": shin}


def _bio(d: str, sleep=None, rhr=None, hrv=None) -> dict:
    return {"date": d, "sleep_total_min": sleep, "rhr": rhr, "hrv_overnight": hrv}


def _session(d: str, session_type: str, done: str) -> dict:
    return {"date": d, "session_type": session_type, "done": done}


def _weekly(week_start: str, week: str, dates_label: str, planned_km=None) -> dict:
    return {
        "week_start": week_start,
        "week": week,
        "dates_label": dates_label,
        "planned_km": planned_km,
    }


# W4 = 2026-08-10 (Mon) .. 2026-08-16 (Sun) — the first fully clean week
# per UNDERSTATED_VOLUME_CUTOFF (2026-08-08). W3 (2026-08-03..09) precedes
# it and touches the cutoff.


def test_week_selection_is_the_iso_week_containing_today():
    # Wednesday inside W4 — week_start must be that Monday, not the
    # calendar week starting on `today`.
    result = week_checkin([], [], [], [], [], date(2026, 8, 12))
    assert result["week_start"] == date(2026, 8, 10)
    assert result["week_end"] == date(2026, 8, 16)


def test_week_selection_on_a_sunday_is_the_week_ending_today():
    result = week_checkin([], [], [], [], [], date(2026, 8, 16))
    assert result["week_start"] == date(2026, 8, 10)
    assert result["week_end"] == date(2026, 8, 16)


def test_volume_and_ramp_hand_checked():
    activities = [
        _run("2026-08-10", 5.0),
        _run("2026-08-12", 6.0),
        _run("2026-08-16", 4.0),  # this week total: 15.0
        _run("2026-08-04", 4.0),
        _run("2026-08-06", 5.0),  # prev week total: 9.0
    ]
    result = week_checkin(activities, [], [], [], [], date(2026, 8, 16))
    assert result["actual_km"] == 15.0
    assert result["prev_actual_km"] == 9.0
    # (15.0 - 9.0) / 9.0 = 0.666...
    assert round(result["ramp_pct"], 4) == 0.6667


def test_ramp_is_null_not_a_crash_when_prev_week_has_zero_km():
    activities = [_run("2026-08-10", 5.0)]
    result = week_checkin(activities, [], [], [], [], date(2026, 8, 16))
    assert result["actual_km"] == 5.0
    assert result["prev_actual_km"] == 0.0
    assert result["ramp_pct"] is None


def test_planned_km_and_labels_come_from_the_weekly_row_when_it_exists():
    weekly = [_weekly("2026-08-10", "Week 4", "Aug 10-16", planned_km=32.0)]
    result = week_checkin([], [], [], [], weekly, date(2026, 8, 12))
    assert result["week_label"] == "Week 4"
    assert result["dates_label"] == "Aug 10-16"
    assert result["planned_km"] == 32.0


def test_planned_is_unknown_not_omitted_when_no_weekly_row_exists():
    result = week_checkin([], [], [], [], [], date(2026, 8, 12))
    assert result["week_label"] is None
    assert result["dates_label"] is None
    assert "planned_km" in result
    assert result["planned_km"] is None


def test_session_compliance_is_one_entry_per_day_mon_to_sun():
    sessions = [
        _session("2026-08-10", "Easy Run", "Yes"),
        _session("2026-08-12", "Medio", "Partial"),
    ]
    result = week_checkin([], [], [], sessions, [], date(2026, 8, 12))
    assert len(result["sessions"]) == 7
    assert result["sessions"][0] == {
        "date": date(2026, 8, 10),
        "session_type": "Easy Run",
        "done": "Yes",
    }
    # Tuesday (index 1) has no sessions row — says so via null, not an
    # omitted entry.
    assert result["sessions"][1] == {
        "date": date(2026, 8, 11),
        "session_type": None,
        "done": None,
    }
    assert result["sessions"][6]["date"] == date(2026, 8, 16)


def test_wellness_means_exclude_missing_nights_a_missing_night_is_not_a_zero():
    # Only 3 of 7 nights have a biometrics row at all (non-wear rule, §5)
    # plus one row present but with a null rhr specifically.
    biometrics = [
        _bio("2026-08-10", sleep=420, rhr=44, hrv=50),
        _bio("2026-08-11", sleep=400, rhr=None, hrv=48),  # rhr unanswered this night
        _bio("2026-08-13", sleep=410, rhr=46, hrv=52),
    ]
    result = week_checkin([], [], biometrics, [], [], date(2026, 8, 12))
    w = result["wellness"]
    # hand mean: (420 + 400 + 410) / 3 = 410.0
    assert w["sleep_mean_min"] == 410.0
    assert w["sleep_n"] == 3
    # hand mean, excluding the null: (44 + 46) / 2 = 45.0
    assert w["rhr_mean"] == 45.0
    assert w["rhr_n"] == 2
    # hand mean: (50 + 48 + 52) / 3 = 50.0
    assert w["hrv_mean"] == 50.0
    assert w["hrv_n"] == 3


def test_wellness_means_are_null_not_zero_with_no_biometrics_rows_at_all():
    result = week_checkin([], [], [], [], [], date(2026, 8, 12))
    w = result["wellness"]
    assert w["sleep_mean_min"] is None
    assert w["sleep_n"] == 0
    assert w["rhr_mean"] is None
    assert w["hrv_mean"] is None


def test_shin_max_is_over_answered_days_only_with_coverage_reported():
    # A 0 on Monday must not be beaten by treating unanswered days as 0 —
    # the real max here is 2, from Wednesday, over 3 answered days.
    daily = [
        _daily("2026-08-10", shin=0),
        _daily("2026-08-12", shin=2),
        _daily("2026-08-14", shin=1),
    ]
    result = week_checkin([], daily, [], [], [], date(2026, 8, 12))
    w = result["wellness"]
    assert w["shin_max"] == 2
    assert w["shin_answered"] == 3


def test_shin_max_is_null_not_zero_when_nothing_answered_all_week():
    daily = [_daily("2026-08-10", shin=None)]
    result = week_checkin([], daily, [], [], [], date(2026, 8, 12))
    w = result["wellness"]
    assert w["shin_max"] is None
    assert w["shin_answered"] == 0


def test_a_zero_shin_on_one_day_is_not_hidden_by_partial_coverage():
    daily = [_daily("2026-08-10", shin=0)]
    result = week_checkin([], daily, [], [], [], date(2026, 8, 12))
    w = result["wellness"]
    assert w["shin_max"] == 0
    assert w["shin_answered"] == 1


def test_pre_break_week_sets_understated_volume():
    # W3: 2026-08-03..09 — week_start (08-03) is before the cutoff (08-08).
    result = week_checkin([], [], [], [], [], date(2026, 8, 9))
    assert result["week_start"] == date(2026, 8, 3)
    assert result["understated_volume"] is True
    assert result["understated_volume_cutoff"] == date(2026, 8, 8)


def test_week_touching_break_only_via_the_comparison_week_still_flags():
    # W4 itself (08-10..16) is fully post-break, but its ramp compares
    # against W3 (08-03..09), which starts before the cutoff — the flag
    # must still be set, per the binding rule ("selected week OR
    # comparison week").
    result = week_checkin([], [], [], [], [], date(2026, 8, 16))
    assert result["week_start"] == date(2026, 8, 10)
    assert result["understated_volume"] is True


def test_fully_post_break_pair_does_not_flag():
    # W5 (08-17..23) vs W4 (08-10..16) — both weeks start on or after the
    # cutoff. This is the first pair in the data where neither the
    # selected week nor its comparison touches pre-break dates.
    result = week_checkin([], [], [], [], [], date(2026, 8, 20))
    assert result["week_start"] == date(2026, 8, 17)
    assert result["understated_volume"] is False


def test_output_carries_no_composite_or_verdict_field():
    # §3.1/§3.3 binding: this block reports numbers and coverage only.
    result = week_checkin([], [], [], [], [], date(2026, 8, 12))
    banned = {"score", "verdict", "status", "rating", "grade"}
    assert not (banned & result.keys())
    assert not (banned & result["wellness"].keys())
