from datetime import date

import pytest
from fakes import FakeGarminClient, FakeSupabase

from sync import (
    TYPE_MAP,
    build_session_map,
    normalize_type,
    repair_session_links,
    sync_activities,
)

SESSION_A = "11111111-1111-1111-1111-111111111111"
SESSION_B = "22222222-2222-2222-2222-222222222222"


# --- build_session_map -------------------------------------------------


def test_build_session_map_single_session_links():
    rows = [{"id": SESSION_A, "date": "2026-08-12"}]
    session_map = build_session_map(rows)
    assert session_map == {"2026-08-12": SESSION_A}


def test_build_session_map_no_session_for_date():
    rows = [{"id": SESSION_A, "date": "2026-08-12"}]
    session_map = build_session_map(rows)
    assert session_map.get("2026-08-13") is None


def test_build_session_map_duplicate_date_warns_and_omits(capsys):
    rows = [
        {"id": SESSION_A, "date": "2026-08-12"},
        {"id": SESSION_B, "date": "2026-08-12"},
    ]
    session_map = build_session_map(rows)

    assert "2026-08-12" not in session_map
    err = capsys.readouterr().out
    assert "WARNING" in err
    assert "2026-08-12" in err


# --- sync_activities -----------------------------------------------------


def test_sync_activities_links_when_single_session_matches():
    db = FakeSupabase()
    client = FakeGarminClient({"2026-08-12": [101]})
    session_map = {"2026-08-12": SESSION_A}

    count = sync_activities(client, db, date(2026, 8, 12), session_map)

    assert count == 1
    row = db.table("activities").rows[101]
    assert row["session_id"] == SESSION_A


def test_sync_activities_leaves_null_when_no_session_matches():
    db = FakeSupabase()
    client = FakeGarminClient({"2026-08-12": [101]})
    session_map: dict = {}  # no sessions row for this date

    sync_activities(client, db, date(2026, 8, 12), session_map)

    row = db.table("activities").rows[101]
    assert row.get("session_id") is None


def test_sync_activities_does_not_null_an_already_linked_row():
    db = FakeSupabase()
    # Simulate a row already linked by a previous run/repair pass.
    db.table("activities").rows[101] = {"id": 101, "date": "2026-08-12", "session_id": SESSION_A}
    client = FakeGarminClient({"2026-08-12": [101]})
    session_map: dict = {}  # this run finds no sessions row for the date

    sync_activities(client, db, date(2026, 8, 12), session_map)

    row = db.table("activities").rows[101]
    assert row["session_id"] == SESSION_A, "existing non-null session_id must never be nulled"


def test_sync_activities_skips_unmapped_type_and_warns_without_raising(capsys):
    db = FakeSupabase()
    client = FakeGarminClient({"2026-08-14": [201]}, type_keys_by_id={201: "paddling"})
    session_map: dict = {}

    count = sync_activities(client, db, date(2026, 8, 14), session_map)

    assert count == 0
    assert 201 not in db.table("activities").rows
    err = capsys.readouterr().out
    assert "::warning::" in err
    assert "paddling" in err
    assert "2026-08-14" in err


def test_sync_activities_writes_mapped_and_skips_unmapped_in_same_day():
    db = FakeSupabase()
    client = FakeGarminClient(
        {"2026-08-14": [301, 302]},
        type_keys_by_id={301: "running", 302: "paddling"},
    )
    session_map: dict = {}

    count = sync_activities(client, db, date(2026, 8, 14), session_map)

    assert count == 1
    assert 301 in db.table("activities").rows
    assert 302 not in db.table("activities").rows


# --- normalize_type -----------------------------------------------------


def test_normalize_type_indoor_cardio_maps_to_other():
    # 15 Aug 2026 incident: Garmin's 'indoor_cardio' typeKey (parentTypeId
    # 29, same fitness-equipment category as strength_training) had no
    # TYPE_MAP entry. Confirmed against the actual activity (0 distance,
    # avgHR 136, name "Cardio") to be gym cardio work, not the stationary
    # bike — that's a separate 'indoor_cycling' activity already mapped to
    # 'cycling'. See DASHBOARD_SPEC.md incident log.
    assert normalize_type("indoor_cardio") == "other"


def test_type_map_has_no_running_or_cycling_bucket_typos():
    assert set(TYPE_MAP.values()) == {"running", "cycling", "other"}


def test_normalize_type_raises_for_unmapped_key():
    with pytest.raises(Exception):
        normalize_type("paddling")


# --- repair_session_links --------------------------------------------------


def test_repair_pass_links_previously_null_row_once_session_exists():
    db = FakeSupabase()
    db.table("activities").rows[101] = {"id": 101, "date": "2026-08-17", "session_id": None}
    session_map = {"2026-08-17": SESSION_A}

    linked, still_null = repair_session_links(db, session_map)

    assert (linked, still_null) == (1, 0)
    assert db.table("activities").rows[101]["session_id"] == SESSION_A


def test_repair_pass_leaves_row_null_with_no_matching_session():
    db = FakeSupabase()
    db.table("activities").rows[101] = {"id": 101, "date": "2026-08-30", "session_id": None}
    session_map: dict = {}  # no session yet for that far-future date

    linked, still_null = repair_session_links(db, session_map)

    assert (linked, still_null) == (0, 1)
    assert db.table("activities").rows[101]["session_id"] is None
