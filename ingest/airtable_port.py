"""One-time Airtable archive port — DASHBOARD_SPEC.md §5, v1.19 amendment,
§12 Phase 2 (Meso 1 boundary, 17 Aug 2026). Ports the athlete's coaching
Airtable base (Sessions/Weekly/Benchmarks) into the `sessions`/`weekly`/
`benchmarks` tables created by migration 006. Never the Airtable API: this
script reads a JSON export dumped from the base, the same "read a static
export, not a live API" shape as strava_import.py — the export must live
OUTSIDE this repo, same reasoning as that file (the free-text Note/Actual/
Verdict/Current Limiter fields carry health and personal detail at the
same sensitivity as the journal column CLAUDE.md rule 14 keeps out of the
repo, even though nothing here is coordinate-shaped).

Usage:
    python airtable_port.py /absolute/path/to/airtable_export.json

Export JSON shape (produced once, outside this script, from the base
app7sRMwLDr7xSKJB — Sessions tblJAdiUwwayatLbk, Weekly tbl5muRFb6f6s7fQT,
Benchmarks tblZafnPD03lnx4sV):

    {"sessions": [...], "weekly": [...], "benchmarks": [...]}

Each element is `{"id": <airtable record id>, "cellValuesByFieldId": {...}}`
— the Airtable API's own field-ID-keyed record shape, used verbatim rather
than renamed by hand, to avoid a silent transcription error swapping two
similarly-named columns. Field IDs are hardcoded below per table, mirroring
strava_import.py's col_index-by-header-name approach for the CSV case.

Airtable's own `Shin (0-3)` field (fldQSWN5D6M5gxAiD) is READ BY NO CODE
PATH in this file — CLAUDE.md rule 13 / spec §5's v1.19 amendment #1:
`sessions` has no shin column, `daily.shin` (via /log) is the sole source,
and Airtable's Shin field was empty on every row anyway.

Validation happens before any write, not during (item 2 of the task this
script was written for): every `phase`/`session_type`/`done` value is
checked against the CHECK-constraint vocabulary (mirrored below from
migration 006) and every `weekly.Dates` string is parsed and asserted to a
clean Monday-Sunday span before a single row is upserted. A bad value
anywhere aborts the whole run, naming the offending Airtable record id,
date, and value — never a partial write followed by a database-level
constraint violation.

Undated Benchmarks row, found during this port and not covered by the
task's validation list (phase/session_type/done only) — resolved here,
recorded in the same commit's DASHBOARD_SPEC.md amendment: Airtable's
"Bloodwork (ferritin/iron/D/B12)" row carries a Test name and a Notes
field ("Open action - book for after a rest day this week.") but no Date,
Result, or Vs Projection — it is an open to-do, not a completed test
event. `benchmarks.date` is `not null` by deliberate migration-006 design
(every other row is a real dated test). Inventing a placeholder date would
violate CLAUDE.md rule 12 (never coerce a missing value to a default);
aborting the entire port over one undated to-do row would block four real,
well-formed benchmark rows over an unrelated data-shape mismatch. This
script SKIPS any benchmarks row with no Date, reporting it by Airtable
record id and Test name in the run summary — not a silent drop.

Writes are upsert — sessions ON CONFLICT (date), weekly ON CONFLICT
(week_start), benchmarks ON CONFLICT (test, date) — DO UPDATE, batched,
never insert (CLAUDE.md rule 4). Running this script twice must leave the
database in the same state as running it once.

The activities.session_id backfill (UPDATE ... FROM sessions ...) is a
separate step, not performed by this script — see the commit this script
shipped in.
"""

import argparse
import json
import re
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client
import os

load_dotenv(Path(__file__).parent / ".env")

# ============================================================
# Sessions — field IDs (table tblJAdiUwwayatLbk) and CHECK vocab, mirrored
# from db/migrations/006_sessions_weekly_benchmarks.sql
# ============================================================
SESSIONS_FIELDS = {
    "date": "fldU1iWDmvry5F7Gj",
    "week": "fldOAeEK8FAbEtekn",
    "phase": "fldeIDJUFQSXCxeDt",
    "session_type": "fldpIt4Z110dXOxxt",
    "purpose": "fldHNdkGgeTq5w0fd",
    "prescription": "fldlqsfUgKFyLi9E4",
    "done": "fldQ7oacDsqzLHvOd",
    "actual": "fldoXWhtpfIU1UwYJ",
    "rpe": "fldD9i5nzH4aZdYe3",
    "note": "fldgrhwY6X1Cqdrw7",
    # fldQSWN5D6M5gxAiD ("Shin (0-3)") deliberately absent — see docstring.
}

PHASE_VOCAB = {"Build 1", "Deload - Camp", "Build 2 + Benchmark"}
SESSION_TYPE_VOCAB = {
    "Easy Run", "Medio", "Long Run", "Strength A", "Strength B",
    "Hill Sprints", "Strides", "Flying-30 Test", "Rest / Check-in",
    "Benchmark Test", "Intervals", "Cross-training",
}
DONE_VOCAB = {"Pending", "Yes", "Partial", "No"}

# ============================================================
# Weekly — field IDs (table tbl5muRFb6f6s7fQT)
# ============================================================
WEEKLY_FIELDS = {
    "week": "flddebNx9Hv8fSkIG",
    "dates_label": "fld1b4nrtEM6lN1KD",
    "planned_km": "fldWPmsqFRuYqShQ4",
    "actual_km": "fldczv8dxGoc0LFAl",
    "sessions_hit": "fld9U8MUUQSXUIcWL",
    "sleep_avg_h": "fldu5uHJqHpmDLX1l",
    "rhr_avg": "fldjst6Z5kH8Ycq7O",
    "hrv_avg": "fldqMWORNKuMdJWXO",
    "current_limiter": "fldjro8PqNv0iaj87",
    "verdict": "fldfxS8xcH4E0CiUr",
}

WEEKLY_PORT_YEAR = 2026  # spec v1.19 amendment #3 — every known week falls in 2026
MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}
DATES_LABEL_RE = re.compile(
    r"^([A-Za-z]{3})\s+(\d{1,2})-(?:([A-Za-z]{3})\s+)?(\d{1,2})$"
)

# ============================================================
# Benchmarks — field IDs (table tblZafnPD03lnx4sV)
# ============================================================
BENCHMARKS_FIELDS = {
    "test": "fldelEKJpzF5mNLj9",
    "date": "fldmdX9qwXGhwsdzZ",
    "result": "fldzmC9q0X4cszXtJ",
    "vs_projection": "fldwO63FKZUT1WcLz",
    "notes": "fld4dz7ohmRZAexvO",
}


class ValidationError(RuntimeError):
    """A row failed a check-vocab or date-parse validation. Raised before
    any write happens — the whole run aborts rather than writing partially
    (item 2 of the task this script was written for)."""


def cell(record: dict, field_id: str):
    return record["cellValuesByFieldId"].get(field_id)


def select_name(record: dict, field_id: str, label: str) -> str:
    """Airtable singleSelect cells arrive as {"id","name","color"} — this
    pulls the plain name Postgres's CHECK constraints actually compare
    against. A missing or malformed cell here means a required NOT NULL
    column (phase/session_type/done are all `not null`) would import as
    NULL, which a bare `check (col in (...))` would silently pass — so
    this is itself a hard validation failure, not just a KeyError.
    """
    value = cell(record, field_id)
    if not isinstance(value, dict) or "name" not in value:
        raise ValidationError(
            f"sessions record {record['id']} (date={cell(record, SESSIONS_FIELDS['date'])}): "
            f"{label} is empty or not a singleSelect value: {value!r}"
        )
    return value["name"]


def validate_sessions(records: list[dict]) -> list[dict]:
    rows = []
    for r in records:
        d = cell(r, SESSIONS_FIELDS["date"])
        phase = select_name(r, SESSIONS_FIELDS["phase"], "Phase")
        session_type = select_name(r, SESSIONS_FIELDS["session_type"], "Session Type")
        done = select_name(r, SESSIONS_FIELDS["done"], "Done")

        if phase not in PHASE_VOCAB:
            raise ValidationError(
                f"sessions record {r['id']} (date={d}): Phase {phase!r} is not "
                f"in the CHECK vocabulary {sorted(PHASE_VOCAB)}"
            )
        if session_type not in SESSION_TYPE_VOCAB:
            raise ValidationError(
                f"sessions record {r['id']} (date={d}): Session Type {session_type!r} "
                f"is not in the CHECK vocabulary {sorted(SESSION_TYPE_VOCAB)}"
            )
        if done not in DONE_VOCAB:
            raise ValidationError(
                f"sessions record {r['id']} (date={d}): Done {done!r} is not "
                f"in the CHECK vocabulary {sorted(DONE_VOCAB)}"
            )
        if not d:
            raise ValidationError(f"sessions record {r['id']}: Date is empty")

        rows.append({
            "date": d,
            "week": cell(r, SESSIONS_FIELDS["week"]),
            "phase": phase,
            "session_type": session_type,
            "purpose": cell(r, SESSIONS_FIELDS["purpose"]),
            "prescription": cell(r, SESSIONS_FIELDS["prescription"]),
            "done": done,
            "actual": cell(r, SESSIONS_FIELDS["actual"]),
            "rpe": cell(r, SESSIONS_FIELDS["rpe"]),
            "note": cell(r, SESSIONS_FIELDS["note"]),
        })
    return rows


def parse_dates_label(label: str, record_id: str, week: str) -> tuple[date, date]:
    m = DATES_LABEL_RE.match(label.strip()) if label else None
    if not m:
        raise ValidationError(
            f"weekly record {record_id} ({week}): Dates {label!r} does not "
            "match the expected 'Mon D-D' / 'Mon D-Mon D' shape"
        )
    start_mon, start_day, end_mon, end_day = m.groups()
    end_mon = end_mon or start_mon
    if start_mon not in MONTHS or end_mon not in MONTHS:
        raise ValidationError(
            f"weekly record {record_id} ({week}): Dates {label!r} uses an "
            f"unrecognised month abbreviation"
        )
    try:
        start = date(WEEKLY_PORT_YEAR, MONTHS[start_mon], int(start_day))
        end = date(WEEKLY_PORT_YEAR, MONTHS[end_mon], int(end_day))
    except ValueError as e:
        raise ValidationError(
            f"weekly record {record_id} ({week}): Dates {label!r} does not "
            f"parse to real calendar dates in {WEEKLY_PORT_YEAR}: {e}"
        ) from None

    if end != start + timedelta(days=6):
        raise ValidationError(
            f"weekly record {record_id} ({week}): Dates {label!r} parsed to "
            f"{start.isoformat()}..{end.isoformat()}, not a clean 7-day span"
        )
    if start.isoweekday() != 1:
        raise ValidationError(
            f"weekly record {record_id} ({week}): Dates {label!r} starts on "
            f"{start.strftime('%A')} ({start.isoformat()}), not a Monday"
        )
    return start, end


def validate_weekly(records: list[dict]) -> list[dict]:
    rows = []
    for r in records:
        week = cell(r, WEEKLY_FIELDS["week"])
        dates_label = cell(r, WEEKLY_FIELDS["dates_label"])
        week_start, week_end = parse_dates_label(dates_label, r["id"], week)
        rows.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "week": week,
            "dates_label": dates_label,
            "planned_km": cell(r, WEEKLY_FIELDS["planned_km"]),
            "actual_km": cell(r, WEEKLY_FIELDS["actual_km"]),
            "sessions_hit": cell(r, WEEKLY_FIELDS["sessions_hit"]),
            "sleep_avg_h": cell(r, WEEKLY_FIELDS["sleep_avg_h"]),
            "rhr_avg": cell(r, WEEKLY_FIELDS["rhr_avg"]),
            "hrv_avg": cell(r, WEEKLY_FIELDS["hrv_avg"]),
            "current_limiter": cell(r, WEEKLY_FIELDS["current_limiter"]),
            "verdict": cell(r, WEEKLY_FIELDS["verdict"]),
        })
    return rows


def validate_benchmarks(records: list[dict]) -> tuple[list[dict], list[str]]:
    """Returns (rows_to_write, skipped_descriptions). A row with no Date is
    skipped, not aborted — see the docstring's "Undated Benchmarks row"
    section for why."""
    rows = []
    skipped = []
    for r in records:
        test = cell(r, BENCHMARKS_FIELDS["test"])
        d = cell(r, BENCHMARKS_FIELDS["date"])
        if not test:
            raise ValidationError(f"benchmarks record {r['id']}: Test is empty")
        if not d:
            skipped.append(f"{r['id']} ({test!r}) — no Date, not a completed test event")
            continue
        rows.append({
            "test": test,
            "date": d,
            "result": cell(r, BENCHMARKS_FIELDS["result"]),
            "vs_projection": cell(r, BENCHMARKS_FIELDS["vs_projection"]),
            "notes": cell(r, BENCHMARKS_FIELDS["notes"]),
        })
    return rows, skipped


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} not set. Copy ingest/.env.example to ingest/.env and "
            "fill in real values."
        )
    return value


def get_supabase() -> Client:
    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "export_path",
        type=Path,
        help="Absolute path to the Airtable export JSON. Must live outside this repo.",
    )
    args = parser.parse_args()
    export_path = args.export_path.expanduser().resolve()

    repo_root = Path(__file__).resolve().parent.parent
    if repo_root == export_path or repo_root in export_path.parents:
        raise SystemExit(
            f"{export_path} is inside the repo ({repo_root}). The export carries "
            "free-text personal/health notes and must stay outside — same "
            "reasoning as CLAUDE.md rule 14."
        )

    with export_path.open(encoding="utf-8") as f:
        export = json.load(f)

    sessions_read = export["sessions"]
    weekly_read = export["weekly"]
    benchmarks_read = export["benchmarks"]
    print(
        f"Read {len(sessions_read)} sessions, {len(weekly_read)} weekly, "
        f"{len(benchmarks_read)} benchmarks record(s) from {export_path}"
    )

    # Validate every row of every table BEFORE any write (item 2 of the task).
    sessions_rows = validate_sessions(sessions_read)
    weekly_rows = validate_weekly(weekly_read)
    benchmarks_rows, benchmarks_skipped = validate_benchmarks(benchmarks_read)
    print("Validation passed — phase/session_type/done vocab and weekly Mon-Sun spans all clean.")
    for s in benchmarks_skipped:
        print(f"  skipping benchmarks {s}")

    db = get_supabase()

    db.table("sessions").upsert(sessions_rows, on_conflict="date").execute()
    print(f"  upserted {len(sessions_rows)} sessions row(s)")

    db.table("weekly").upsert(weekly_rows, on_conflict="week_start").execute()
    print(f"  upserted {len(weekly_rows)} weekly row(s)")

    if benchmarks_rows:
        db.table("benchmarks").upsert(benchmarks_rows, on_conflict="test,date").execute()
    print(f"  upserted {len(benchmarks_rows)} benchmarks row(s)")

    print(
        "\nDone.\n"
        f"  sessions:   read {len(sessions_read)}, written {len(sessions_rows)}, skipped 0\n"
        f"  weekly:     read {len(weekly_read)}, written {len(weekly_rows)}, skipped 0\n"
        f"  benchmarks: read {len(benchmarks_read)}, written {len(benchmarks_rows)}, "
        f"skipped {len(benchmarks_skipped)}"
    )


if __name__ == "__main__":
    main()
