"""
engine_state.py
----------------
Holds the ONE instance of each heavy AI engine (face recognition, YOLO
object detector) so they're loaded once at startup, not per-request.
Routers import these from here rather than constructing their own.
"""

import threading
from typing import Optional
from sqlalchemy.orm import Session

face_engine = None    # type: Optional["FaceRecognitionEngine"]
yolo_detector = None  # type: Optional["YOLO26Detector"]

# The YOLO (onnxruntime/ultralytics) and InsightFace (onnxruntime) sessions
# are NOT safe to call concurrently from multiple threads. Video-processing
# jobs run in background threads (routers/video_processing.py), and live
# camera streams run in their own background threads too
# (routers/live_camera.py) - without this lock, two of those calling the
# same underlying model at once could hang indefinitely, which is exactly
# what was leaving uploaded videos stuck in PROCESSING forever whenever more
# than one was running at the same time. analysis_pipeline.analyze_frame()
# acquires this lock around every real inference call.
inference_lock = threading.Lock()


def init_face_engine():
    """Called once from main.py's startup event."""
    global face_engine
    import os
    from face_engine import FaceRecognitionEngine, DEFAULT_MATCH_THRESHOLD
    threshold = float(os.getenv("FACE_MATCH_THRESHOLD", str(DEFAULT_MATCH_THRESHOLD)))
    face_engine = FaceRecognitionEngine(match_threshold=threshold)


def init_yolo_detector():
    """Called once from main.py's startup event."""
    global yolo_detector
    from yolo26_detector import YOLO26Detector
    yolo_detector = YOLO26Detector(model_weights="yolo11n.pt", conf_thresh=0.45)


def rebuild_face_index(db: Session) -> int:
    """
    Reloads the FAISS index from stored vector representations in the DB.
    Zero image decoding, zero face re-detection, zero model re-inference.
    Executes in <1ms without blocking the server or pegging CPU.
    Returns the number of vectors now in the index.
    """
    import json
    import numpy as np
    import crud

    rows = crud.all_face_embeddings(db)
    triples = []
    
    for r in rows:
        try:
            raw = json.loads(r.vector_json)
        except (TypeError, ValueError):
            continue
        
        emp_id = r.employee_id
        emp_name = r.employee.full_name if r.employee else "Unknown"
        
        if isinstance(raw, list):
            if raw and isinstance(raw[0], (int, float)):
                # Single 1D vector (512-d)
                if np.linalg.norm(raw) > 0.01:
                    triples.append((emp_id, emp_name, raw))
            elif raw and isinstance(raw[0], list):
                # Multiple precomputed vectors (base + CCTV pitch + flip + CLAHE)
                for vec in raw:
                    if vec and np.linalg.norm(vec) > 0.01:
                        triples.append((emp_id, emp_name, vec))
        elif isinstance(raw, dict):
            base = raw.get("base")
            if base and np.linalg.norm(base) > 0.01:
                triples.append((emp_id, emp_name, base))
            for aug in raw.get("augmented", []):
                if aug and np.linalg.norm(aug) > 0.01:
                    triples.append((emp_id, emp_name, aug))

    if face_engine:
        with inference_lock:
            face_engine.build_index(triples)
    return len(triples)

