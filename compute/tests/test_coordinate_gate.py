"""Coordinate-stripping gate — CLAUDE.md rule 1, DASHBOARD_SPEC.md §4/§11.

The required assertion: no output JSON contains a key matching
/lat|lon|coord|polyline/. The bare pattern false-positives on
verticalOscillation ("osci-LAT-ion") — a real, published §5 field — so
this must use whole-token matching (same fix as ingest/explore.py) and
this test proves both directions: the real field survives, a real
coordinate key gets caught.
"""

from metrics import assert_no_private_keys, find_private_keys, is_private_key


def test_vertical_oscillation_survives():
    assert is_private_key("verticalOscillation") is False
    assert is_private_key("avg_vertical_oscillation") is False


def test_other_lat_lon_substring_words_survive():
    # "cumulativeAscent" contains "lat" (cumu-LAT-ive), "feedbackLongType"
    # contains "lon" (LON-g) — neither is a coordinate field.
    assert is_private_key("cumulativeAscent") is False
    assert is_private_key("feedbackLongType") is False
    assert is_private_key("avg_ground_contact_ms") is False


def test_real_coordinate_keys_are_caught():
    for key in ["lat", "lon", "latitude", "longitude", "startLatitude", "endLongitude"]:
        assert is_private_key(key) is True, key


def test_other_private_keys_are_caught():
    for key in ["polyline", "startCoordinate", "locationName", "ownerFullName"]:
        assert is_private_key(key) is True, key


def test_find_private_keys_on_realistic_output_shape():
    clean_output = {
        "date": "2026-08-08",
        "avg_cadence": 170,
        "avg_vertical_oscillation": 9.27,
        "avg_vertical_ratio": 8.44,
        "shin_plus1": None,
    }
    assert find_private_keys(clean_output) == []
    assert_no_private_keys(clean_output)  # must not raise


def test_find_private_keys_catches_a_leaked_coordinate_nested_in_output():
    leaked_output = {
        "date": "2026-08-08",
        "avg_vertical_oscillation": 9.27,  # must survive alongside the real leak
        "route": {"startLatitude": 45.07, "startLongitude": 7.68},
    }
    hits = find_private_keys(leaked_output)
    assert "$.route.startLatitude" in hits
    assert "$.route.startLongitude" in hits
    assert not any("avg_vertical_oscillation" in h for h in hits)

    try:
        assert_no_private_keys(leaked_output)
        assert False, "expected ValueError for a coordinate-shaped key"
    except ValueError:
        pass
