"""Tests for multi-frame plate voting.

The case that matters is the one the model report describes: individual frames
each miss a different character, and no single frame is right. If voting cannot
recover the plate there, it is not earning its place in the pipeline.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tracking import PlateTracker, Track, box_iou  # noqa: E402


BOX = (100.0, 100.0, 200.0, 140.0)


def toks(s):
    return s.split()


def test_iou_identical_boxes_is_one():
    assert box_iou(BOX, BOX) == 1.0


def test_iou_disjoint_boxes_is_zero():
    assert box_iou(BOX, (500.0, 500.0, 600.0, 540.0)) == 0.0


def test_same_plate_across_frames_is_one_track():
    tr = PlateTracker()
    for i in range(4):
        # Drifting slightly, as a vehicle approaching a camera does.
        box = (100.0 + i * 4, 100.0, 200.0 + i * 4, 140.0)
        out = tr.update([(box, toks("Ba 12 Pa 3456"), 0.8)])
    assert out[0]["trackId"] == 1
    assert out[0]["sightings"] == 4


def test_distant_boxes_become_separate_tracks():
    tr = PlateTracker()
    tr.update([(BOX, toks("Ba 12 Pa 3456"), 0.8)])
    out = tr.update([((900.0, 300.0, 1000.0, 340.0), toks("Ga 02 Cha 3311"), 0.8)])
    assert out[0]["trackId"] == 2


def test_voting_recovers_a_plate_no_single_frame_read_correctly():
    """The headline case. Each frame drops or mangles a different character;
    the majority at every position is still right."""
    tr = PlateTracker()
    frames = [
        "Ba 12 Pa 9456",   # 4th token wrong
        "Ba 17 Pa 3456",   # 2nd token wrong
        "Ba 12 Pa 3456",   # correct
        "Ka 12 Pa 3456",   # 1st token wrong
        "Ba 12 Ra 3456",   # 3rd token wrong
    ]
    out = None
    for text in frames:
        out = tr.update([(BOX, toks(text), 0.8)])
    assert out[0]["text"] == "Ba 12 Pa 3456"
    assert out[0]["stable"] is True


def test_high_confidence_frame_outweighs_low_confidence_ones():
    """A crisp close-up should beat two blurred guesses at a split position."""
    t = Track(track_id=1, box=BOX)
    t.observe(BOX, toks("Ba 12 Pa 3456"), 0.95, 100.0)
    t.observe(BOX, toks("Ba 12 Pa 3455"), 0.20, 101.0)
    t.observe(BOX, toks("Ba 12 Pa 3457"), 0.20, 102.0)
    text, _, _ = t.vote()
    assert text == "Ba 12 Pa 3456"


def test_short_readings_do_not_truncate_the_plate():
    """A frame that clips a character must not shorten everyone else's read."""
    tr = PlateTracker()
    for text in ["Ba 12 Pa 3456", "Ba 12 Pa 3456", "12 Pa 3456", "Ba 12 Pa 3456"]:
        out = tr.update([(BOX, toks(text), 0.8)])
    assert out[0]["text"] == "Ba 12 Pa 3456"


def test_not_stable_until_seen_repeatedly():
    """One lucky frame must not be reported as a confident sighting."""
    tr = PlateTracker()
    out = tr.update([(BOX, toks("Ba 12 Pa 3456"), 0.9)])
    assert out[0]["stable"] is False


def test_disagreement_lowers_reported_confidence():
    """A plate read confidently but differently each time is not confident."""
    agree = Track(track_id=1, box=BOX)
    disagree = Track(track_id=2, box=BOX)
    for _ in range(4):
        agree.observe(BOX, toks("Ba 12 Pa 3456"), 0.8, 100.0)
    for text in ["Ba 12 Pa 3456", "Ka 19 Ra 7788", "Ga 44 Cha 1122", "Ma 02 Pa 9087"]:
        disagree.observe(BOX, toks(text), 0.8, 100.0)
    assert agree.vote()[1] > disagree.vote()[1]


def test_located_but_unread_frames_do_not_dilute_the_vote():
    """An empty read is evidence the vehicle is there, not a ballot."""
    tr = PlateTracker()
    tr.update([(BOX, toks("Ba 12 Pa 3456"), 0.8)])
    tr.update([(BOX, [], 0.0)])
    out = tr.update([(BOX, toks("Ba 12 Pa 3456"), 0.8)])
    assert out[0]["text"] == "Ba 12 Pa 3456"
    assert out[0]["sightings"] == 3


def test_tracks_expire_after_the_vehicle_leaves():
    tr = PlateTracker()
    tr.update([(BOX, toks("Ba 12 Pa 3456"), 0.8)], now=1000.0)
    out = tr.update([(BOX, toks("Ba 12 Pa 3456"), 0.8)], now=1000.0 + 60)
    assert out[0]["trackId"] == 2, "a plate seen a minute later is a new vehicle"


def test_two_plates_in_one_frame_keep_their_own_votes():
    """Dense traffic: several plates per frame, each voted independently."""
    tr = PlateTracker()
    a = (100.0, 100.0, 200.0, 140.0)
    b = (600.0, 300.0, 700.0, 340.0)
    for _ in range(3):
        out = tr.update([
            (a, toks("Ba 12 Pa 3456"), 0.8),
            (b, toks("Ga 02 Cha 3311"), 0.7),
        ])
    assert out[0]["text"] == "Ba 12 Pa 3456"
    assert out[1]["text"] == "Ga 02 Cha 3311"
    assert out[0]["trackId"] != out[1]["trackId"]
