"""Minimal fakes for testing sync.py's session-linking logic without a
real Supabase connection or Garmin client. FakeTable mirrors the specific
PostgREST upsert semantic the code under test relies on: a key omitted
from an upsert payload is left untouched on conflict, not set to NULL —
see sync.py's session_id comment.
"""

from types import SimpleNamespace


class FakeTable:
    def __init__(self):
        self.rows: dict = {}
        self._pending = None
        self._filters = []

    def upsert(self, row, on_conflict=None):
        self._pending = ("upsert", dict(row))
        return self

    def update(self, row):
        self._pending = ("update", dict(row))
        return self

    def select(self, cols=None):
        self._pending = ("select", None)
        return self

    def eq(self, col, val):
        self._filters.append(lambda r, col=col, val=val: r.get(col) == val)
        return self

    def is_(self, col, val):
        target = None if val in ("null", None) else val
        self._filters.append(lambda r, col=col, target=target: r.get(col) == target)
        return self

    def execute(self):
        op, payload = self._pending
        filters, self._filters = self._filters, []
        self._pending = None

        if op == "select":
            matched = [r for r in self.rows.values() if all(f(r) for f in filters)]
            return SimpleNamespace(data=[dict(r) for r in matched])

        if op == "update":
            matched = [r for r in self.rows.values() if all(f(r) for f in filters)]
            for r in matched:
                r.update(payload)
            return SimpleNamespace(data=[dict(r) for r in matched])

        if op == "upsert":
            key = payload["id"]
            if key in self.rows:
                self.rows[key].update(payload)
            else:
                self.rows[key] = dict(payload)
            return SimpleNamespace(data=[dict(self.rows[key])])

        raise AssertionError(f"unexpected op {op!r}")


class FakeSupabase:
    def __init__(self):
        self._tables: dict[str, FakeTable] = {}

    def table(self, name):
        return self._tables.setdefault(name, FakeTable())


def make_activity_detail(activity_id: int, type_key: str = "running") -> dict:
    """Just enough of get_activity(id)'s shape for sync_activities to read."""
    return {
        "activityId": activity_id,
        "activityTypeDTO": {"typeKey": type_key},
        "summaryDTO": {
            "distance": 8000.0,
            "duration": 2400.0,
            "averageHR": 150.0,
            "maxHR": 170.0,
            "averageRunCadence": 170.0,
            "verticalOscillation": 8.0,
            "verticalRatio": 6.0,
            "groundContactTime": 240.0,
            "elevationGain": 30.0,
        },
    }


class FakeGarminClient:
    """Serves one canned activity stub per date, keyed by activity_id."""

    def __init__(self, activities_by_date: dict[str, list[int]], type_key: str = "running"):
        self.activities_by_date = activities_by_date
        self.type_key = type_key

    def get_activities_fordate(self, ds: str) -> dict:
        ids = self.activities_by_date.get(ds, [])
        return {
            "ActivitiesForDay": {
                "payload": [{"activityId": aid} for aid in ids],
            }
        }

    def get_activity(self, activity_id: int) -> dict:
        return make_activity_detail(activity_id, self.type_key)
