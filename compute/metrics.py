"""Metric definitions — DASHBOARD_SPEC.md §7. Binding, not reinterpreted.

Every function here is pure: it takes data already fetched by the caller
and returns a value. No network, no filesystem, no Supabase client. The
compute-layer driver that fetches from Supabase and assembles output JSON
lives elsewhere (compute/report_live.py) — CLAUDE.md rule 3, "metric
definitions live in compute/metrics.py only," is read here as "and only
metric definitions live in compute/metrics.py."

`activities` / `biometrics` / `daily` rows are plain dicts shaped like the
matching table (db/migrations/002_biometrics_activities.sql,
001_daily.sql), with `date` as either a `datetime.date` or an ISO string —
`_to_date` normalises either.

Rule 12 (CLAUDE.md): a nullable field is never coerced to a default here.
A `None` stays `None` all the way to whatever this module returns; the
one field this binds hardest on is `daily.shin` (§5's null rule), handled
explicitly in `shin_series` and `impact_mechanics` below.

Where a metric cannot be computed from what it was given — not enough
history, a device-break gap, a zero denominator — the function returns an
`InsufficientData` value, never a zero, never a guess (task rule: "must
not silently produce a number from insufficient data").
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import mean, median
from typing import Any

# ---------------------------------------------------------------------------
# Bands and thresholds — every one of these is a value spec §7 states
# outright, not a threshold invented here. Where §7 didn't state one
# (rhr_baseline's min_n), it was added to the spec itself (v1.6) rather
# than improvised silently — see DASHBOARD_SPEC.md's v1.6 amendment.
# ---------------------------------------------------------------------------

EASY_BAND_S_PER_KM = (315, 335)  # 5:15–5:35 /km, §7 easy_band_compliance
MEDIO_BAND_S_PER_KM = (230, 240)  # 3:50–4:00 /km, §7 medio_control
MEDIO_RACED_THRESHOLD_S_PER_KM = 225  # sub-3:45 /km flags as raced, §7
WARMUP_EXCLUDE_S = 600  # "first 10 min of each run", §7 (easy_band_compliance, aerobic_efficiency)

RHR_WINDOW_DAYS = 30  # §7 rhr_baseline
RHR_BASELINE_MIN_N = 14  # added spec v1.6 — see module docstring above
HRV_BASELINE_MIN_DAYS = 21  # §7 hrv_baseline, "≥ 21 days on FR70"
HRV_MEAN_SHORT_WINDOW_DAYS = 7
HRV_MEAN_LONG_WINDOW_DAYS = 30

SHIN_IN_BAND_MAX = 0  # shin <= this is "in band" (solid marker), §10 — added spec v1.x amendment.
# 0 is the only in-band value: full_plan.md's autoregulation table treats
# any shin whisper as an amber trigger and the athlete's standing protocol
# acts on any reading above 0. A 0–1 split would render a shin of 1 as a
# solid in-band marker on the primary periostitis early-warning chart
# (§8.3), hiding the first signal the chart exists to surface — the
# conservative direction on an early-warning chart is to flag sooner.

UNDERSTATED_VOLUME_CUTOFF = date(2026, 8, 8)  # §7/§8.3 v1.7 amendment.
# rolling_7d_km for any date before this reads on pre-FR70 Strava/Zepp
# tracking, confirmed as an unknown, uneven floor on true volume, never a
# measurement — plotting it against real shin scores understates the
# volume the shins actually carried, so any point in this range is
# flagged rather than rendered as an ordinary measurement.

RUNNING = "running"  # CLAUDE.md rule 6 — cycling excluded from every running total

TODAY_FLAG_VOLUME_RAMP_PCT = 0.10  # §8.1 v1.26 amendment, Flag rule 3.
# Same 10% tolerance as §7 ramp_pct's reference band, but applied to a
# completed rolling 7-day window rather than a calendar week — see
# today_flag()'s docstring for why. "More than 10% above" is strict (>),
# not >=.


@dataclass(frozen=True)
class InsufficientData:
    """Explicit "cannot compute this" signal — never a zero, never a guess."""

    reason: str
    n: int | None = None
    required: int | None = None


def _to_date(value: date | str) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _running_km(row: dict) -> float | None:
    if row.get("type") != RUNNING:
        return None
    return row.get("distance_km")


# ---------------------------------------------------------------------------
# Volume: weekly_km, ramp_pct, rolling_7d_km, rolling_28d_km
# ---------------------------------------------------------------------------


def weekly_km(activities: list[dict], week_start: date) -> float:
    """Sum of running distance_km, week_start..week_start+6 inclusive.

    Cycling is excluded (CLAUDE.md rule 6) — filtered by `_running_km`,
    which only returns a value for type == 'running'. A running row with
    a null distance_km (schema allows it) is skipped rather than crashing
    the sum; there is no "unanswered" state to preserve here the way
    there is for shin — an activity row with no distance simply
    contributes nothing to a Σ metric.
    """
    week_end = week_start + timedelta(days=6)
    total = 0.0
    for row in activities:
        km = _running_km(row)
        if km is None:
            continue
        if week_start <= _to_date(row["date"]) <= week_end:
            total += km
    return total


def ramp_pct(current_week_km: float, prev_week_km: float | None) -> float | InsufficientData:
    """(current − prev) / prev. §7 reference band: ≤ 10%.

    A zero or missing prev_week_km makes the ratio undefined — a division
    by zero, not a 0% or a ∞% ramp. Real gaps in the running history
    (weeks with no logged distance) will hit this.
    """
    if prev_week_km is None or prev_week_km == 0:
        return InsufficientData(
            reason="prev_week_km is zero or unknown — ramp % is undefined, not 0",
            n=0 if prev_week_km == 0 else None,
            required=1,
        )
    return (current_week_km - prev_week_km) / prev_week_km


def _rolling_running_km(activities: list[dict], as_of: date, window_days: int) -> float:
    start = as_of - timedelta(days=window_days - 1)
    total = 0.0
    for row in activities:
        km = _running_km(row)
        if km is None:
            continue
        if start <= _to_date(row["date"]) <= as_of:
            total += km
    return total


def rolling_7d_km(activities: list[dict], as_of: date) -> float:
    return _rolling_running_km(activities, as_of, 7)


def rolling_28d_km(activities: list[dict], as_of: date) -> float:
    return _rolling_running_km(activities, as_of, 28)


# ---------------------------------------------------------------------------
# Segment-dependent metrics — DASHBOARD_SPEC.md v1.6 amendment.
#
# `easy_band_compliance`, `medio_control`, `aerobic_efficiency`, and
# `decoupling` all reference a portion of a run narrower than the whole
# activity. No table stores per-run splits today (§12's new `laps`
# phase), so these take laps as an explicit argument: a lap is
# `{"start_s": int, "duration_s": int, "distance_km": float,
# "avg_hr": float | None}`, `start_s` being elapsed time from the start
# of the run when the lap began. Nothing in ingest or the database
# currently produces this shape — these functions are correct against
# hand-checked synthetic laps (compute/tests/) and return
# InsufficientData against anything real today, since there is no real
# lap data to pass them.
# ---------------------------------------------------------------------------


def _lap_pace_s_per_km(lap: dict) -> float | None:
    distance_km = lap.get("distance_km")
    if not distance_km:
        return None
    return lap["duration_s"] / distance_km


def _steady_laps(laps: list[dict], warmup_s: int = WARMUP_EXCLUDE_S) -> list[dict]:
    return [lap for lap in laps if lap["start_s"] >= warmup_s]


def easy_band_compliance(easy_runs: list[list[dict]]) -> float | InsufficientData:
    """% of easy-run km, post-warmup, with pace in [5:15, 5:35]/km.

    `easy_runs` is a list of already-classified easy runs (§7's
    "easy-run km" — classifying a run as easy is a sessions/plan concern,
    out of scope until Phase 2, so the caller supplies only the runs
    already known to be easy), each an ordered list of laps for that run.
    """
    steady_laps = [lap for run in easy_runs for lap in _steady_laps(run)]
    total_km = sum(lap["distance_km"] for lap in steady_laps)
    if total_km == 0:
        return InsufficientData(
            reason="no post-warmup km in the supplied easy runs", n=0, required=1
        )
    in_band_km = sum(
        lap["distance_km"]
        for lap in steady_laps
        if (pace := _lap_pace_s_per_km(lap)) is not None
        and EASY_BAND_S_PER_KM[0] <= pace <= EASY_BAND_S_PER_KM[1]
    )
    return in_band_km / total_km * 100


def medio_control(medio_laps: list[dict]) -> dict | InsufficientData:
    """Mean pace over the medio segment vs band [3:50, 4:00]/km.

    `medio_laps` is the set of laps making up the medio effort itself —
    the caller has already excluded warm-up/cool-down laps when building
    this list (which laps count as "the medio segment" is itself a
    session/plan-authored boundary, same out-of-scope-until-Phase-2
    reasoning as easy_band_compliance above).
    """
    total_km = sum(lap["distance_km"] for lap in medio_laps)
    total_s = sum(lap["duration_s"] for lap in medio_laps)
    if not medio_laps or total_km == 0:
        return InsufficientData(reason="no medio laps supplied", n=0, required=1)
    mean_pace = total_s / total_km
    return {
        "mean_pace_s_per_km": mean_pace,
        "in_band": MEDIO_BAND_S_PER_KM[0] <= mean_pace <= MEDIO_BAND_S_PER_KM[1],
        "raced": mean_pace < MEDIO_RACED_THRESHOLD_S_PER_KM,
    }


def _efficiency(laps: list[dict]) -> float | InsufficientData:
    """speed_m_s / avg_hr over the given laps, no warm-up filtering — the
    caller decides which laps are in scope (used directly by
    aerobic_efficiency, and by decoupling on each half)."""
    total_distance_m = sum(lap["distance_km"] * 1000 for lap in laps)
    total_duration_s = sum(lap["duration_s"] for lap in laps)
    if total_duration_s == 0:
        return InsufficientData(reason="zero duration in supplied laps", n=0, required=1)
    hr_laps = [lap for lap in laps if lap.get("avg_hr")]
    hr_duration_s = sum(lap["duration_s"] for lap in hr_laps)
    if hr_duration_s == 0:
        return InsufficientData(reason="no HR data in supplied laps", n=0, required=1)
    avg_hr = sum(lap["avg_hr"] * lap["duration_s"] for lap in hr_laps) / hr_duration_s
    speed_m_s = total_distance_m / total_duration_s
    return speed_m_s / avg_hr


def aerobic_efficiency(laps: list[dict]) -> float | InsufficientData:
    """Easy runs only, steady segment (first 10 min excluded): speed_m_s / avg_hr."""
    steady = _steady_laps(laps)
    if not steady:
        return InsufficientData(reason="no post-warmup laps supplied", n=0, required=1)
    return _efficiency(steady)


def decoupling(laps: list[dict]) -> float | InsufficientData:
    """aerobic_efficiency(second half) / aerobic_efficiency(first half), per run.

    Halves are split on the steady segment's total duration — each lap is
    assigned to whichever half contains its temporal midpoint, so a lap
    straddling the midpoint doesn't get double-counted or dropped.
    """
    steady = _steady_laps(laps)
    if len(steady) < 2:
        return InsufficientData(
            reason="fewer than 2 post-warmup laps — cannot split into halves",
            n=len(steady),
            required=2,
        )
    total_s = sum(lap["duration_s"] for lap in steady)
    half_s = total_s / 2
    first_half, second_half = [], []
    cursor = 0.0
    for lap in steady:
        midpoint = cursor + lap["duration_s"] / 2
        (first_half if midpoint <= half_s else second_half).append(lap)
        cursor += lap["duration_s"]
    if not first_half or not second_half:
        return InsufficientData(
            reason="all laps fell in one half", n=len(steady), required=2
        )
    ae_first = _efficiency(first_half)
    ae_second = _efficiency(second_half)
    if isinstance(ae_first, InsufficientData) or isinstance(ae_second, InsufficientData):
        return InsufficientData(reason="insufficient HR/distance data in one half")
    if ae_first == 0:
        return InsufficientData(reason="first-half aerobic efficiency is zero")
    return ae_second / ae_first


# ---------------------------------------------------------------------------
# Biometric baselines: rhr_baseline, hrv_baseline
# ---------------------------------------------------------------------------


def _rows_on_current_device(biometrics: list[dict], as_of: date) -> tuple[str, list[dict]] | None:
    """Every row up to as_of, then narrowed to the device active on as_of —
    CLAUDE.md rule 5: nothing averages across the Amazfit/FR70 break."""
    rows_le = [r for r in biometrics if _to_date(r["date"]) <= as_of]
    if not rows_le:
        return None
    current_device = max(rows_le, key=lambda r: _to_date(r["date"]))["device"]
    return current_device, [r for r in rows_le if r["device"] == current_device]


def rhr_baseline(
    biometrics: list[dict], as_of: date, min_n: int = RHR_BASELINE_MIN_N
) -> dict | InsufficientData:
    """30-day rolling median RHR, band = ±1 MAD, never spans the device break.

    min_n = 14 (spec v1.6): below that the MAD collapses toward zero and
    would render nearly every subsequent day as "out of band" — a false
    alert, worse than showing nothing (see the v1.6 amendment).
    """
    resolved = _rows_on_current_device(biometrics, as_of)
    if resolved is None:
        return InsufficientData(reason="no biometrics rows on or before as_of", n=0, required=min_n)
    device, device_rows = resolved
    start = as_of - timedelta(days=RHR_WINDOW_DAYS - 1)
    window_values = [
        r["rhr"]
        for r in device_rows
        if start <= _to_date(r["date"]) <= as_of and r.get("rhr") is not None
    ]
    n = len(window_values)
    if n < min_n:
        return InsufficientData(
            reason=f"only {n} rhr reading(s) on {device} in the trailing "
            f"{RHR_WINDOW_DAYS}d window (never spans the device break)",
            n=n,
            required=min_n,
        )
    med = median(window_values)
    mad = median(sorted(abs(v - med) for v in window_values))
    return {"median": med, "mad": mad, "band": (med - mad, med + mad), "n": n, "device": device}


def hrv_baseline(
    biometrics: list[dict], as_of: date, min_days: int = HRV_BASELINE_MIN_DAYS
) -> dict | InsufficientData:
    """7-day mean vs 30-day mean HRV, plus Garmin's own HRV Status.

    Requires ≥ 21 calendar days on the current device before rendering at
    all — days elapsed since the device switch, not days with data, since
    non-wear days are real elapsed days even though sync.py's non-wear
    rule (spec §6, v1.4) skips writing a row for them.
    """
    resolved = _rows_on_current_device(biometrics, as_of)
    if resolved is None:
        return InsufficientData(reason="no biometrics rows on or before as_of", n=0, required=min_days)
    device, device_rows = resolved
    first_date = min(_to_date(r["date"]) for r in device_rows)
    days_elapsed = (as_of - first_date).days + 1
    if days_elapsed < min_days:
        return InsufficientData(
            reason=f"{days_elapsed} day(s) elapsed on {device}, needs {min_days}",
            n=days_elapsed,
            required=min_days,
        )

    def _mean_hrv(window_days: int) -> float | None:
        start = as_of - timedelta(days=window_days - 1)
        values = [
            r["hrv_overnight"]
            for r in device_rows
            if start <= _to_date(r["date"]) <= as_of and r.get("hrv_overnight") is not None
        ]
        return mean(values) if values else None

    latest_status = next(
        (
            r["hrv_status"]
            for r in sorted(device_rows, key=lambda r: _to_date(r["date"]), reverse=True)
            if r.get("hrv_status") is not None
        ),
        None,
    )
    return {
        "mean_7d": _mean_hrv(HRV_MEAN_SHORT_WINDOW_DAYS),
        "mean_30d": _mean_hrv(HRV_MEAN_LONG_WINDOW_DAYS),
        "hrv_status": latest_status,  # stored/returned as-is, including literal "NONE" — spec §5
        "device": device,
        "days_elapsed": days_elapsed,
    }


# ---------------------------------------------------------------------------
# impact_mechanics, shin_series — both join against daily.shin.
# Rule 12 is binding here: a NULL shin is never coerced to 0.
# ---------------------------------------------------------------------------


def _shin_by_date(daily: list[dict]) -> dict[date, int | None]:
    return {_to_date(r["date"]): r.get("shin") for r in daily}


def impact_mechanics(activities: list[dict], daily: list[dict]) -> list[dict]:
    """Per run: avg_cadence, avg_vertical_oscillation, avg_vertical_ratio,
    joined to daily.shin at date+1 and date+2 (§7). A date with no daily
    row and a date with an explicit NULL shin are indistinguishable in
    this schema (daily.shin is required to save at all — spec §8.5's
    footer is disabled until shin is answered) and both come out as
    `None` here, never 0.
    """
    shin_by_date = _shin_by_date(daily)
    results = []
    for row in activities:
        if row.get("type") != RUNNING:
            continue
        d = _to_date(row["date"])
        results.append(
            {
                "date": d,
                "avg_cadence": row.get("avg_cadence"),
                "avg_vertical_oscillation": row.get("avg_vertical_oscillation"),
                "avg_vertical_ratio": row.get("avg_vertical_ratio"),
                "shin_plus1": shin_by_date.get(d + timedelta(days=1)),
                "shin_plus2": shin_by_date.get(d + timedelta(days=2)),
            }
        )
    return results


def _shin_band(shin_value: int | None) -> str:
    """§10's third marker state: "in_band" (solid), "out_of_band" (hollow),
    or "not_answered" (absent). SHIN_IN_BAND_MAX defines the threshold —
    see its comment above for why 0 is the only in-band value."""
    if shin_value is None:
        return "not_answered"
    return "in_band" if shin_value <= SHIN_IN_BAND_MAX else "out_of_band"


def shin_series(activities: list[dict], daily: list[dict], start: date, end: date) -> dict:
    """daily.shin joined to rolling_7d_km, one entry per day in [start, end].

    Every day in range appears, including days with no daily row — those
    render with shin=None, never 0 (§5's null rule, §7, §10's third
    marker state). Coverage is reported as answered/total, per §7. Each
    entry also carries `band` (§10's in_band/out_of_band/not_answered
    marker state, never derived by the frontend — CLAUDE.md rule 3) and
    `understated_volume` (§8.3's v1.7 pre-FR70 floor-not-measurement
    flag), so the render layer never has to hardcode either threshold.
    """
    shin_by_date = _shin_by_date(daily)
    series = []
    answered = 0
    day = start
    while day <= end:
        shin_value = shin_by_date.get(day)
        if shin_value is not None:
            answered += 1
        series.append(
            {
                "date": day,
                "shin": shin_value,
                "rolling_7d_km": rolling_7d_km(activities, day),
                "band": _shin_band(shin_value),
                "understated_volume": day < UNDERSTATED_VOLUME_CUTOFF,
            }
        )
        day += timedelta(days=1)
    total = (end - start).days + 1
    return {"series": series, "coverage": {"answered": answered, "total": total}}


# ---------------------------------------------------------------------------
# §8.1 Today page — last_night, session_for_date, today_flag.
# Added spec v1.26. See that amendment for the full reasoning; summarised
# in each function's docstring below.
# ---------------------------------------------------------------------------


def last_night(biometrics: list[dict], as_of: date) -> dict | InsufficientData:
    """Panel 1 ("Last night"): sleep/RHR/HRV for the most recent night, plus
    a current-device-era-only value list and a computed band-eligibility
    date. Deliberately computes **no band** — DASHBOARD_SPEC.md's v1.26
    amendment: the only baselines that exist (RHR/HRV) were recorded on the
    Amazfit and do not transfer to the FR70 (CLAUDE.md rule 5), and
    Garmin's own HRV Status needs HRV_BASELINE_MIN_DAYS nights on a device
    before it means anything (§7 hrv_baseline). A real band is added to
    hrv_baseline/rhr_baseline once enough FR70 nights exist, not invented
    here from a handful of nights.

    Reuses `_rows_on_current_device` (same device-break filtering as
    rhr_baseline/hrv_baseline, CLAUDE.md rule 5) so the value list never
    crosses the Amazfit/FR70 break, and no cap beyond that — the era is
    short by construction today, and once it grows past "small" a real
    band replaces this list entirely (see the v1.26 amendment).
    """
    resolved = _rows_on_current_device(biometrics, as_of)
    if resolved is None:
        return InsufficientData(reason="no biometrics rows on or before as_of", n=0, required=1)
    device, device_rows = resolved
    latest = max(device_rows, key=lambda r: _to_date(r["date"]))
    first_date = min(_to_date(r["date"]) for r in device_rows)
    values = sorted(
        (
            {
                "date": _to_date(r["date"]),
                "sleep_total_min": r.get("sleep_total_min"),
                "rhr": r.get("rhr"),
                "hrv_overnight": r.get("hrv_overnight"),
            }
            for r in device_rows
        ),
        key=lambda r: r["date"],
    )
    return {
        "date": _to_date(latest["date"]),
        "sleep_total_min": latest.get("sleep_total_min"),
        "rhr": latest.get("rhr"),
        "hrv_overnight": latest.get("hrv_overnight"),
        "device": device,
        "device_since": first_date,
        "values": values,
        # First date the elapsed-day count reaches HRV_BASELINE_MIN_DAYS —
        # same "days elapsed since first row on this device" convention as
        # hrv_baseline's own days_elapsed, not a count of nights with data.
        "band_possible_from": first_date + timedelta(days=HRV_BASELINE_MIN_DAYS - 1),
    }


def session_for_date(sessions: list[dict], target: date) -> dict | None:
    """Panel 2 ("Today's session"): the single `sessions` row for `target`
    (date is unique, §5), narrowed to the four fields the panel shows. No
    row for the date is a real state, not an error — returns None, and the
    render layer says so plainly rather than showing an empty panel.
    """
    for row in sessions:
        if _to_date(row["date"]) == target:
            return {
                "session_type": row.get("session_type"),
                "purpose": row.get("purpose"),
                "prescription": row.get("prescription"),
                "done": row.get("done"),
            }
    return None


def today_flag(activities: list[dict], daily: list[dict], today: date) -> dict | None:
    """Panel 3 ("Flag"): at most one, evaluated in order, stopping at the
    first hit — DASHBOARD_SPEC.md §8.1 v1.26 amendment.

    1. daily.shin > 0 on today or yesterday (today checked first). NULL is
       never a hit — NULL means not answered, never "fine" (§5's null
       rule, CLAUDE.md rule 12).
    2. daily.illness is True on today or yesterday (today checked first).
    3. Completed rolling 7-day km more than TODAY_FLAG_VOLUME_RAMP_PCT
       above the preceding completed 7-day total. "Completed" means the
       window ends yesterday, not today — today is still in progress and
       including it would be a projection, which this rule must never do.
       This deliberately reuses rolling_7d_km/ramp_pct (already tested
       elsewhere) rather than reimplementing the ratio, but note it is NOT
       the same metric as §7's ramp_pct: that one compares calendar
       Mon-Sun weeks via weekly_km, this compares two trailing 7-day
       windows via rolling_7d_km, per this page's own spec.

       Suppressed entirely — not caveated, not rendered with a warning —
       if either 7-day window contains any date before
       UNDERSTATED_VOLUME_CUTOFF (§7/§8.3 v1.7: pre-FR70 distance is an
       unknown floor, not a measurement, so a ramp computed over it is an
       unknown-magnitude number, not a smaller-but-valid one). Reuses that
       same module-level constant rather than a second hardcoded date, per
       v1.16's binding "read from data/one source of truth" precedent
       (DASHBOARD_SPEC.md v1.27 amendment). The two windows are
       contiguous, so checking the earlier (prev) window's start date is
       sufficient to catch "any date in either window."

    Returns None when nothing qualifies — the caller renders no panel at
    all, not an empty or "nothing to report" one (§8.1). Suppression of
    rule 3 falls through to this same None, exactly as if rule 3 had
    simply not matched; it never substitutes a different flag kind.
    """
    shin_by_date = _shin_by_date(daily)
    for d in (today, today - timedelta(days=1)):
        shin_value = shin_by_date.get(d)
        if shin_value is not None and shin_value > 0:
            return {"kind": "shin", "date": d, "shin": shin_value}

    illness_by_date = {_to_date(r["date"]): r.get("illness") for r in daily}
    for d in (today, today - timedelta(days=1)):
        if illness_by_date.get(d) is True:
            return {"kind": "illness", "date": d}

    completed_end = today - timedelta(days=1)
    prev_window_end = completed_end - timedelta(days=7)
    prev_window_start = prev_window_end - timedelta(days=6)
    if prev_window_start >= UNDERSTATED_VOLUME_CUTOFF:
        current_7d_km = rolling_7d_km(activities, completed_end)
        prev_7d_km = rolling_7d_km(activities, prev_window_end)
        pct = ramp_pct(current_7d_km, prev_7d_km)
        if not isinstance(pct, InsufficientData) and pct > TODAY_FLAG_VOLUME_RAMP_PCT:
            return {
                "kind": "volume_ramp",
                "window_end": completed_end,
                "current_7d_km": current_7d_km,
                "prev_7d_km": prev_7d_km,
                "pct": pct,
            }
    return None


# ---------------------------------------------------------------------------
# §8.2 Week page — week_checkin ("Generate check-in"). Added spec v1.28.
#
# The Week page's terminating action (§3.3): the paste-ready text block
# Luca sends his coach every Sunday. This function computes every number,
# every coverage count, and the one data-quality flag the block reports —
# the render layer (web/src/panels/checkinCopy.ts) only turns this dict
# into Markdown text, it does not calculate anything (CLAUDE.md rule 3).
# No composite score and no verdict field anywhere in the return value —
# §3.1/§3.3, binding on this block specifically per the v1.28 amendment.
# ---------------------------------------------------------------------------


def _iso_week_start(today: date) -> date:
    """Monday of the ISO week containing `today`. On a Sunday, that week
    still ends today — Monday is 6 days back, never the coming week."""
    return today - timedelta(days=today.weekday())


def _weekly_row_for(weekly: list[dict], week_start: date) -> dict | None:
    for row in weekly:
        if _to_date(row["week_start"]) == week_start:
            return row
    return None


def _mean_and_count(values: list[float | None]) -> tuple[float | None, int]:
    """Mean over non-null values only, plus how many contributed. A missing
    night is excluded from the mean and reduces the count — never averaged
    as 0 (§5's null rule, applied here to biometrics rather than shin)."""
    present = [v for v in values if v is not None]
    if not present:
        return None, 0
    return mean(present), len(present)


def week_checkin(
    activities: list[dict],
    daily: list[dict],
    biometrics: list[dict],
    sessions: list[dict],
    weekly: list[dict],
    today: date,
) -> dict:
    """§8.2 "Generate check-in" — DASHBOARD_SPEC.md §3.3, v1.28 amendment.

    Week selection: the ISO week (Mon-Sun) containing `today`, always —
    there is no picker (§8.2 v1.28: not stated in the spec's original
    panel table, decided when this function was specified).

    `weekly`/`sessions`/`daily`/`biometrics` are only ever consulted for
    rows inside [week_start, week_end] (or, for `activities`, the two
    weeks needed for the ramp) — callers may pass a pre-scoped slice or
    the whole table; this function filters by date itself either way,
    same convention as `shin_series`.

    Tracking-break guard, distinct from `today_flag`'s suppression
    (v1.27): that panel drops the number entirely because it is read
    unattended with no surrounding context (§1, §3). This block is read
    by Luca before he sends it and is addressed to the coach — hiding the
    week's actual km would remove information the coach needs regardless
    of its precision, so this function still returns every number and
    instead sets `understated_volume: True` when the selected week or its
    comparison week touches a pre-8-Aug-2026 date, reusing
    `UNDERSTATED_VOLUME_CUTOFF` (no second hardcoded date, same precedent
    as v1.16/v1.27). The frontend renders that flag as an explicit
    caveat line, never silently.
    """
    week_start = _iso_week_start(today)
    week_end = week_start + timedelta(days=6)
    prev_week_start = week_start - timedelta(days=7)

    weekly_row = _weekly_row_for(weekly, week_start)

    actual_km = weekly_km(activities, week_start)
    prev_actual_km = weekly_km(activities, prev_week_start)
    ramp = ramp_pct(actual_km, prev_actual_km)

    session_days = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        session = session_for_date(sessions, d)
        session_days.append(
            {
                "date": d,
                "session_type": session["session_type"] if session else None,
                "done": session["done"] if session else None,
            }
        )

    sleep_vals, rhr_vals, hrv_vals = [], [], []
    for row in biometrics:
        d = _to_date(row["date"])
        if week_start <= d <= week_end:
            sleep_vals.append(row.get("sleep_total_min"))
            rhr_vals.append(row.get("rhr"))
            hrv_vals.append(row.get("hrv_overnight"))
    sleep_mean, sleep_n = _mean_and_count(sleep_vals)
    rhr_mean, rhr_n = _mean_and_count(rhr_vals)
    hrv_mean, hrv_n = _mean_and_count(hrv_vals)

    shin_by_date = _shin_by_date(daily)
    week_shin_values = [shin_by_date.get(week_start + timedelta(days=i)) for i in range(7)]
    answered_shin = [v for v in week_shin_values if v is not None]
    shin_max = max(answered_shin) if answered_shin else None

    understated_volume = (
        week_start < UNDERSTATED_VOLUME_CUTOFF or prev_week_start < UNDERSTATED_VOLUME_CUTOFF
    )

    return {
        "week_start": week_start,
        "week_end": week_end,
        "week_label": weekly_row.get("week") if weekly_row else None,
        "dates_label": weekly_row.get("dates_label") if weekly_row else None,
        "actual_km": actual_km,
        "planned_km": weekly_row.get("planned_km") if weekly_row else None,
        "prev_actual_km": prev_actual_km,
        "ramp_pct": None if isinstance(ramp, InsufficientData) else ramp,
        "sessions": session_days,
        "wellness": {
            "sleep_mean_min": sleep_mean,
            "sleep_n": sleep_n,
            "rhr_mean": rhr_mean,
            "rhr_n": rhr_n,
            "hrv_mean": hrv_mean,
            "hrv_n": hrv_n,
            "shin_max": shin_max,
            "shin_answered": len(answered_shin),
        },
        "understated_volume": understated_volume,
        "understated_volume_cutoff": UNDERSTATED_VOLUME_CUTOFF,
    }


# ---------------------------------------------------------------------------
# Coordinate-stripping gate — CLAUDE.md rule 1, DASHBOARD_SPEC.md §4/§11.
#
# Same tokenizing approach as ingest/explore.py's is_private_key, and for
# the same reason: a bare substring check on "lat"/"lon" false-positives
# on ordinary words that happen to contain those three letters —
# verticalOscillation (osci-LAT-ion) chief among them, since it's a real
# §5 field this dashboard publishes by design. Real coordinate keys
# (lat, lon, startLatitude, endLongitude, ...) are always their own
# camelCase/snake_case token, so tokenizing and matching whole tokens
# catches every real one while leaving unrelated words alone.
# ---------------------------------------------------------------------------

PRIVATE_KEY_SUBSTRINGS = re.compile(
    r"coord|polyline|location|activityname"
    r"|fullname|displayname|profileimage|userinfodto|activityimages"
    r"|userprofile|ownerid|deviceid|serial|uuid|guid|unitid",
    re.IGNORECASE,
)
PRIVATE_KEY_TOKENS = {"lat", "lon", "latitude", "longitude"}
_CAMEL_TOKEN_RE = re.compile(r"[A-Z]?[a-z0-9]+|[A-Z]+(?=[A-Z]|$|[0-9])")


def is_private_key(key: str) -> bool:
    if PRIVATE_KEY_SUBSTRINGS.search(key):
        return True
    tokens = {t.lower() for t in _CAMEL_TOKEN_RE.findall(key)}
    return bool(tokens & PRIVATE_KEY_TOKENS)


def find_private_keys(obj: Any, _path: str = "$") -> list[str]:
    """Every key path in obj that matches the coordinate/identity gate."""
    hits: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{_path}.{k}"
            if is_private_key(str(k)):
                hits.append(path)
            hits.extend(find_private_keys(v, path))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits.extend(find_private_keys(v, f"{_path}[{i}]"))
    return hits


def assert_no_private_keys(obj: Any) -> None:
    hits = find_private_keys(obj)
    if hits:
        raise ValueError(f"private/coordinate-shaped key(s) in output: {hits}")
