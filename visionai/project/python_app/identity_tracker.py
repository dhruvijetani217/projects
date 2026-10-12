"""
identity_tracker.py
--------------------
Multi-Frame Voting & Temporal Smoothing for Multi-Angle Face Recognition.

Key Improvements:
1. Multi-Frame Window (3-5 consecutive frames):
   - Rather than making decisions on a single bad/blurred/angled frame, accumulates
     biometric evidence across consecutive frames.
2. Voting & Best-Confidence Resolution:
   - Evaluates employee candidate votes and selects the highest-confidence match in the window.
3. Identity Persistence:
   - Temporarily bridges momentary non-detections or profile drops (e.g. 1-2 frames of extreme
     head turns) while the person remains tracked in camera view.
4. Suppresses False Unknowns:
   - Only marks 'Unknown' if at least 3-4 consecutive frames across the track sequence produce
     no confident employee match.
"""

import threading
import time
from collections import deque, Counter
from typing import Optional, Dict, Any, List

WINDOW_SIZE = 6
EMPLOYEE_MIN_VOTES = 2
UNKNOWN_MIN_VOTES = 3
UNKNOWN_COOLDOWN_SEC = 25.0
PERSISTENCE_TIMEOUT_SEC = 2.5


class _TrackState:
    def __init__(self, track_key: str):
        self.track_key = track_key
        self.history: deque = deque(maxlen=WINDOW_SIZE)
        self.match_history: deque = deque(maxlen=WINDOW_SIZE)
        self.last_confirmed_id: Optional[str] = None
        self.last_confirmed_match: Optional[Dict[str, Any]] = None
        self.last_confirmed_ts: float = 0.0
        self.last_seen_ts: float = 0.0
        self.last_unknown_alert_ts: float = 0.0

    def add_observation(self, raw_match: Optional[Dict[str, Any]]):
        now = time.time()
        self.last_seen_ts = now
        emp_id = raw_match["employee_id"] if raw_match else None
        self.history.append(emp_id)
        self.match_history.append((raw_match, now))


class IdentityTracker:
    def __init__(self):
        self._lock = threading.Lock()
        self._tracks: Dict[str, _TrackState] = {}
        self._camera_states: Dict[str, _TrackState] = {}

    def _get_track(self, camera_id: str, tracking_id: Optional[int] = None) -> _TrackState:
        now = time.time()
        # Clean up stale tracks older than 15 seconds
        stale_keys = [k for k, v in self._tracks.items() if now - v.last_seen_ts > 15.0]
        for k in stale_keys:
            del self._tracks[k]

        if tracking_id is not None:
            key = f"{camera_id}_trk_{tracking_id}"
            if key not in self._tracks:
                self._tracks[key] = _TrackState(key)
            return self._tracks[key]
        else:
            if camera_id not in self._camera_states:
                self._camera_states[camera_id] = _TrackState(camera_id)
            return self._camera_states[camera_id]

    def smooth_frame_faces(self, camera_id: str, faces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Applies multi-frame temporal voting across all faces in a frame.
        Modifies and returns faces with temporally stabilized match decisions.
        """
        with self._lock:
            now = time.time()
            for f in faces:
                tracking_id = f.get("tracking_id")
                state = self._get_track(camera_id, tracking_id)
                raw_match = f.get("match")
                state.add_observation(raw_match)

                # 1. Immediate confirmation if high confidence match (>= 72%)
                if raw_match and raw_match.get("confidence_percentage", 0) >= 72.0:
                    state.last_confirmed_id = raw_match["employee_id"]
                    state.last_confirmed_match = raw_match
                    state.last_confirmed_ts = now
                    f["match"] = raw_match
                    continue

                # 2. Multi-frame voting across recent window
                emp_votes: Dict[str, int] = {}
                emp_best_match: Dict[str, Dict[str, Any]] = {}
                for m, ts in state.match_history:
                    if m and "employee_id" in m:
                        eid = m["employee_id"]
                        emp_votes[eid] = emp_votes.get(eid, 0) + 1
                        if eid not in emp_best_match or m.get("cosine_similarity", 0) > emp_best_match[eid].get("cosine_similarity", 0):
                            emp_best_match[eid] = m

                if emp_votes:
                    best_eid = max(emp_votes.keys(), key=lambda k: emp_votes[k])
                    best_count = emp_votes[best_eid]
                    if best_count >= EMPLOYEE_MIN_VOTES or emp_best_match[best_eid].get("confidence_percentage", 0) >= 70.0:
                        best_m = emp_best_match[best_eid]
                        state.last_confirmed_id = best_eid
                        state.last_confirmed_match = best_m
                        state.last_confirmed_ts = now
                        f["match"] = best_m
                        continue

                # 3. Temporal Persistence: if previously confirmed employee was seen within PERSISTENCE_TIMEOUT_SEC,
                # maintain the identification while face is in view
                if state.last_confirmed_id and (now - state.last_confirmed_ts <= PERSISTENCE_TIMEOUT_SEC):
                    smoothed_m = dict(state.last_confirmed_match)
                    smoothed_m["smoothed"] = True
                    f["match"] = smoothed_m
                else:
                    # Not enough evidence for employee match -> Unknown or Pending
                    f["match"] = None

            return faces

    def resolve(self, camera_id: str, raw_match: Optional[Dict[str, Any]], tracking_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Resolves action trigger (CONFIRMED_EMPLOYEE, ALREADY_CONFIRMED, CONFIRMED_UNKNOWN, SUPPRESSED_UNKNOWN, PENDING)
        for live event and attendance recording.
        """
        with self._lock:
            state = self._get_track(camera_id, tracking_id)
            state.add_observation(raw_match)
            now = time.time()
            emp_id = raw_match["employee_id"] if raw_match else None

            # Fast path: High confidence employee match (>=72%)
            if raw_match and raw_match.get("confidence_percentage", 0) >= 72.0:
                if state.last_confirmed_id != emp_id:
                    state.last_confirmed_id = emp_id
                    state.last_confirmed_match = raw_match
                    state.last_confirmed_ts = now
                    return {"action": "CONFIRMED_EMPLOYEE", "match": raw_match}
                return {"action": "ALREADY_CONFIRMED", "match": state.last_confirmed_match}

            emp_counts = Counter([h for h in state.history if h is not None])
            best_id, best_count = emp_counts.most_common(1)[0] if emp_counts else (None, 0)

            if best_id is not None and best_count >= EMPLOYEE_MIN_VOTES:
                if state.last_confirmed_id != best_id:
                    state.last_confirmed_id = best_id
                    latest_match = next((m for m, _ in reversed(state.match_history) if m and m.get("employee_id") == best_id), raw_match)
                    state.last_confirmed_match = latest_match
                    state.last_confirmed_ts = now
                    return {"action": "CONFIRMED_EMPLOYEE", "match": latest_match}
                return {"action": "ALREADY_CONFIRMED", "match": state.last_confirmed_match}

            # Only confirm UNKNOWN if observed for at least UNKNOWN_MIN_VOTES with no employee matches
            if best_id is None and best_count >= UNKNOWN_MIN_VOTES:
                if now - state.last_unknown_alert_ts >= UNKNOWN_COOLDOWN_SEC:
                    state.last_unknown_alert_ts = now
                    state.last_confirmed_id = None
                    state.last_confirmed_match = None
                    return {"action": "CONFIRMED_UNKNOWN", "match": None}
                return {"action": "SUPPRESSED_UNKNOWN", "match": None}

            return {"action": "PENDING", "match": None}


identity_tracker = IdentityTracker()
