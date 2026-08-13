from datetime import date

from fakes import FakeGarminClient, FakeSupabase

from sync import build_session_map, repair_session_links, sync_activities

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
