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
