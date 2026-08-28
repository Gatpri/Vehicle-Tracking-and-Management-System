"""
Multi-frame plate tracking and vote-based reading.

Why this exists
---------------
MODEL_REPORT.md records the character reader at recall ~0.79 and adds:

    "roughly 1 in 5 characters can be missed on hard images — mitigated in
     practice by multi-frame voting, since misses differ per frame."

The mitigation was described but never implemented in the service: /detect
treated every frame as an independent still and threw the video away. On a
single hard frame a plate reads "BA 12 PA 345"; on the next it reads
"BA 2 PA 3456"; on the third it is right. Reporting whichever frame happened
to arrive is the weakest possible use of a camera that produces 30 of them a
second.

This module keeps a short history per camera. Each plate box is matched to a
track by IoU, each track accumulates the readings taken of it, and the text a
track reports is voted across those readings rather than taken from the latest.

Two properties matter for how it is used downstream:

  - Voting is per character position, not per whole string. Whole-string
    voting needs the same complete misread to recur before it wins; character
    voting recovers a plate no single frame ever read correctly, which is the
    common case when misses are uncorrelated.

  - A track reports `stable` only once it has agreed with itself across
    several frames. An alert on a stolen vehicle should fire on a plate the
    system has seen repeatedly, not on one lucky frame — that is the
    difference between a confident sighting and a false accusation.

Tracks are held per camera and expire on silence, so a stationary vehicle
parked in view does not accumulate votes forever and a camera that goes quiet
does not leak memory.
"""

from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass, field


# How much two boxes must overlap to be judged the same physical plate between
# consecutive frames. Deliberately loose: a plate moving towards the camera
# grows and shifts, and a strict threshold splits one vehicle into a new track
# every few frames, which defeats the point of tracking.
IOU_MATCH = 0.3

# A track with no sighting for this long is finished — the vehicle has left.
TRACK_TTL_S = 3.0

# Readings kept per track. Enough for a vote to be meaningful, bounded so a
# vehicle stopped at a light does not grow without limit.
MAX_READINGS = 24

# Sightings a track needs before its vote is called stable.
MIN_SIGHTINGS_STABLE = 3

# A per-position character vote is only trusted if the winning candidate holds
# this share of the votes cast at that position. Below it, the position is
# genuinely ambiguous and the highest-confidence single reading is preferred
# over a coin-flip majority.
POSITION_AGREEMENT = 0.5


def box_iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    if inter <= 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


@dataclass
class Reading:
    """One frame's opinion of a plate."""
    tokens: tuple
    confidence: float
    at: float


@dataclass
class Track:
    """One physical plate, followed across frames."""
    track_id: int
    box: tuple
    readings: list = field(default_factory=list)
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    sightings: int = 0

    def observe(self, box, tokens, confidence, now):
        self.box = box
        self.last_seen = now
        self.sightings += 1
        # A frame that located the plate but read nothing off it still counts
        # as a sighting — it is evidence the vehicle is there — but it must not
        # dilute the vote with an empty ballot.
        if tokens:
            self.readings.append(Reading(tuple(tokens), confidence, now))
            if len(self.readings) > MAX_READINGS:
                del self.readings[0]

    def vote(self):
        """Best estimate of this plate's text across every reading so far.

        Returns (text, confidence, stable).
        """
        if not self.readings:
            return "", 0.0, False

        # Plate length is itself voted on: a frame that clips a character
        # produces a short reading, and letting it set the length would
        # truncate every other frame's opinion. The most common length wins,
        # ties going to the longer one, since a missed character is a far more
        # common failure than a hallucinated extra one.
        lengths = Counter(len(r.tokens) for r in self.readings)
        best_len = max(lengths.items(), key=lambda kv: (kv[1], kv[0]))[0]
        candidates = [r for r in self.readings if len(r.tokens) == best_len]

        # Per-position vote, weighted by the confidence of the frame it came
        # from — a crisp close-up should outweigh a blurred distant guess.
        out = []
        agreements = []
        for i in range(best_len):
            weights: Counter = Counter()
            for r in candidates:
                weights[r.tokens[i]] += max(r.confidence, 0.01)
            token, weight = max(weights.items(), key=lambda kv: kv[1])
            total = sum(weights.values())
            share = weight / total if total else 0.0
            if share < POSITION_AGREEMENT:
                # Genuinely split. Take the single most confident frame's
                # opinion of this position instead of a bare plurality.
                best = max(candidates, key=lambda r: r.confidence)
                token = best.tokens[i]
            out.append(token)
            agreements.append(share)

        mean_conf = sum(r.confidence for r in candidates) / len(candidates)
        # Reported confidence blends how sure the reader was with how much the
        # frames agreed. A plate read confidently but differently every time is
        # not a confident result, and reporting it as one would be the lie that
        # matters here.
        agreement = sum(agreements) / len(agreements) if agreements else 0.0
        confidence = mean_conf * agreement

        stable = self.sightings >= MIN_SIGHTINGS_STABLE and len(candidates) >= 2
        return " ".join(out), confidence, stable


class PlateTracker:
    """Tracks for one camera."""

    def __init__(self):
        self._tracks: list[Track] = []
        self._next_id = 1

    def update(self, observations, now=None):
        """Match this frame's plates to existing tracks and fold in the reads.

        `observations` is a list of (box, tokens, confidence), where box is
        (x1, y1, x2, y2) in frame pixels and tokens is the read split into
        characters. Returns one result dict per observation, in the same order,
        so the caller can attach the voted text to the plate it belongs to.
        """
        now = now or time.time()
        self._expire(now)

        results = [None] * len(observations)
        claimed: set[int] = set()

        # Greedy best-IoU matching, strongest pair first. Greedy is enough
        # here: plates are small, far apart relative to their size, and rarely
        # ambiguous between frames — the cost of a full assignment solve buys
        # nothing at this scale.
        pairs = []
        for oi, (box, _, _) in enumerate(observations):
            for ti, track in enumerate(self._tracks):
                iou = box_iou(box, track.box)
                if iou >= IOU_MATCH:
                    pairs.append((iou, oi, ti))
        pairs.sort(reverse=True)

        used_obs: set[int] = set()
        for _, oi, ti in pairs:
            if oi in used_obs or ti in claimed:
                continue
            used_obs.add(oi)
            claimed.add(ti)
            box, tokens, conf = observations[oi]
            track = self._tracks[ti]
            track.observe(box, tokens, conf, now)
            results[oi] = self._describe(track)

        # Anything unmatched is a plate we have not seen before.
        for oi, (box, tokens, conf) in enumerate(observations):
            if oi in used_obs:
                continue
            track = Track(track_id=self._next_id, box=box)
            self._next_id += 1
            track.observe(box, tokens, conf, now)
            self._tracks.append(track)
            results[oi] = self._describe(track)

        return results

    def _describe(self, track: Track):
        text, conf, stable = track.vote()
        return {
            "trackId": track.track_id,
            "text": text,
            "confidence": conf,
            "stable": stable,
            "sightings": track.sightings,
            "ageSeconds": round(track.last_seen - track.first_seen, 2),
        }

    def _expire(self, now):
        self._tracks = [t for t in self._tracks if now - t.last_seen <= TRACK_TTL_S]


class TrackerRegistry:
    """One PlateTracker per camera.

    Keyed by whatever the caller uses to identify a feed. Frames arrive as
    separate HTTP requests from the Node backend, so the tracking state has to
    live here between them; without a key per camera, two cameras watching
    different roads would vote on each other's plates.
    """

    def __init__(self):
        self._by_camera: dict[str, PlateTracker] = {}
        self._touched: dict[str, float] = {}

    def get(self, camera_id: str) -> PlateTracker:
        now = time.time()
        self._touched[camera_id] = now
        # Drop cameras that stopped sending a while ago, so a long-running
        # service does not hold a tracker for every camera ever seen.
        stale = [c for c, t in self._touched.items() if now - t > 300]
        for c in stale:
            self._by_camera.pop(c, None)
            self._touched.pop(c, None)
        if camera_id not in self._by_camera:
            self._by_camera[camera_id] = PlateTracker()
        return self._by_camera[camera_id]

    def stats(self):
        return {
            "cameras": len(self._by_camera),
            "tracks": sum(len(t._tracks) for t in self._by_camera.values()),
        }
