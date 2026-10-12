"""
analysis_pipeline.py
---------------------
The ONE place that actually runs AI inference on a frame and turns the
results into real DB rows. Used by BOTH the video-upload flow and the
live-camera/webcam flow, so behavior is identical regardless of source -
exactly what the spec's "AI PIPELINE" diagram calls for
(Frame -> Object Detection -> Tracking -> Face Detection -> Face Recognition
-> Attendance -> Snapshot -> Database).
"""

from datetime import datetime, timedelta
import os
import threading
from typing import Optional, Dict, Any, List

import numpy as np
from sqlalchemy.orm import Session

import crud
from identity_tracker import identity_tracker
import engine_state
import notifications
from database import SessionLocal
from media_storage import save_snapshot, STORAGE_DIR

# Security-relevant COCO classes worth snapshotting on their own (beyond faces).
# Kept intentionally short and honest: only what the base YOLO model can actually
# recognize - no helmet/fire/plate classes (see yolo26_detector.py's honesty note).
NOTABLE_OBJECT_CLASSES = {
    "car", "truck", "bus", "motorcycle", "bicycle", "airplane", "boat", "train",
    "dog", "cat", "bird", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
    "backpack", "handbag", "suitcase", "laptop", "cell phone", "knife",
    "traffic light", "fire hydrant", "stop sign", "surfboard", "skateboard", "bottle",
}


def _local_path_from_media_url(image_url: str) -> Optional[str]:
    """
    save_snapshot() returns a servable URL like "/media/snapshots/<cam>/<f>.jpg".
    This resolves that back to the real file on disk (STORAGE_DIR/snapshots/<cam>/<f>.jpg)
    so it can be attached to an email. Never guesses - only used when the URL
    actually starts with /media/.
    """
    if not image_url or not image_url.startswith("/media/"):
        return None
    return os.path.join(STORAGE_DIR, image_url[len("/media/"):])


def _send_unknown_person_notification(at: datetime, source: str, image_path: Optional[str] = None) -> None:
    """
    Runs in a background thread with its own DB session - never share a
    SQLAlchemy session (especially SQLite's) across threads. Fires for
    EVERY unknown-person event individually (live frame or a single
    analyzed video frame) - no deduplication/throttling by design, so a
    video with many unknown frames sends one WhatsApp+email per frame.
    """
    db = SessionLocal()
    try:
        when = at.strftime('%Y-%m-%d %H:%M:%S')
        if source == "video":
            message = f"An unrecognized face was found while analyzing an uploaded video (timestamp in clip: {when} UTC anchor)."
            title = "Unknown Person Detected (Video Upload)"
        else:
            message = f"An unrecognized face was seen live on camera at {when} UTC."
            title = "Unknown Person Detected"
        notifications.send_alert(db, title=title, message=message, image_path=image_path)
    finally:
        db.close()


def analyze_frame(frame_bgr: np.ndarray,
                  enable_objects: bool = True,
                  enable_face: bool = True,
                  orig_frame_bgr: Optional[np.ndarray] = None) -> Dict[str, Any]:
    """
    Pure inference, no DB writes. Runs the YOLO detector (if enable_objects)
    and the face engine (if enable_face) on one frame and returns raw outputs.
    Integrates person-guided high-resolution head crop analysis for CCTV cameras
    and filters out false-positive background texture artifacts.
    """
    objects = []
    faces = []

    with engine_state.inference_lock:
        # Run YOLO object & vehicle detection if enabled
        if enable_objects:
            if engine_state.yolo_detector and engine_state.yolo_detector.is_loaded:
                _, objects = engine_state.yolo_detector.detect_and_track(frame_bgr)

        # Run Face Detection & ArcFace recognition if enabled
        if enable_face:
            if engine_state.face_engine and engine_state.face_engine.is_loaded:
                full_frame = orig_frame_bgr if orig_frame_bgr is not None else frame_bgr
                full_h, full_w = full_frame.shape[:2]
                fh_scale = full_h / frame_bgr.shape[0] if frame_bgr.shape[0] > 0 else 1.0
                fw_scale = full_w / frame_bgr.shape[1] if frame_bgr.shape[1] > 0 else 1.0

                # 1. Whole-frame detection on full_frame
                raw_faces = engine_state.face_engine.detect_faces(full_frame, max_dim=1280)
                
                # Person correlation: get person boxes in full_frame coordinates
                person_info = []
                for o in objects:
                    if o.get("class", "").lower() == "person":
                        pbx = o["bbox_pixel"]
                        px1 = int(round(pbx[0] * fw_scale))
                        py1 = int(round(pbx[1] * fh_scale))
                        px2 = int(round(pbx[2] * fw_scale))
                        py2 = int(round(pbx[3] * fh_scale))
                        person_info.append({
                            "bbox": [px1, py1, px2, py2],
                            "tracking_id": o.get("tracking_id"),
                            "confidence": o.get("confidence", 0.0),
                        })

                # 2. Person-guided high-resolution head-crop detection
                # For each detected person, crop upper body/head region (top 50% with padding)
                # to detect distant/angled CCTV faces that might be missed or low-res on full frame
                head_crop_faces = []
                for p in person_info:
                    px1, py1, px2, py2 = p["bbox"]
                    pw, ph = max(1, px2 - px1), max(1, py2 - py1)
                    # CCTV overhead crop: top 55% of person with 15% horizontal margin
                    hx1 = max(0, int(px1 - pw * 0.15))
                    hy1 = max(0, int(py1 - ph * 0.10))
                    hx2 = min(full_w, int(px2 + pw * 0.15))
                    hy2 = min(full_h, int(py1 + ph * 0.55))

                    head_crop = full_frame[hy1:hy2, hx1:hx2]
                    if head_crop.size > 0 and min(hx2 - hx1, hy2 - hy1) >= 20:
                        crop_faces = engine_state.face_engine.detect_faces_on_crop(
                            head_crop, offset=(hx1, hy1), full_w=full_w, full_h=full_h
                        )
                        for cf in crop_faces:
                            cf["tracking_id"] = p["tracking_id"]
                            head_crop_faces.append(cf)

                # Merge whole-frame and head-crop face detections
                all_candidate_faces = []
                all_candidate_faces.extend(head_crop_faces)

                for rf in raw_faces:
                    rx1, ry1, rx2, ry2 = rf["bbox_pixel"]
                    rcx, rcy = (rx1 + rx2) / 2.0, (ry1 + ry2) / 2.0
                    already_covered = False
                    for hcf in head_crop_faces:
                        hx1, hy1, hx2, hy2 = hcf["bbox_pixel"]
                        if hx1 <= rcx <= hx2 and hy1 <= rcy <= hy2:
                            already_covered = True
                            break
                    if not already_covered:
                        all_candidate_faces.append(rf)

                # 3. Filter & match faces
                for f in all_candidate_faces:
                    fx1, fy1, fx2, fy2 = f["bbox_pixel"]
                    fcx, fcy = (fx1 + fx2) / 2.0, (fy1 + fy2) / 2.0
                    fw, fh = max(1, fx2 - fx1), max(1, fy2 - fy1)

                    matched_tracking_id = f.get("tracking_id")
                    is_inside_person = False
                    if person_info:
                        for p in person_info:
                            px1, py1, px2, py2 = p["bbox"]
                            pw, ph = max(1, px2 - px1), max(1, py2 - py1)
                            if (px1 - pw * 0.20 <= fcx <= px2 + pw * 0.20) and (py1 - ph * 0.15 <= fcy <= py1 + ph * 0.75):
                                is_inside_person = True
                                if not matched_tracking_id:
                                    matched_tracking_id = p["tracking_id"]
                                break

                    # Suppress false-positive background textures:
                    # If not inside a person, require high detection score (>=0.58) and plausible face aspect ratio
                    if not is_inside_person:
                        if f["det_score"] < 0.58 or min(fw, fh) < 32 or not (0.50 <= fh / fw <= 2.2):
                            continue

                    # Filter out extreme tiny noise (< 20px)
                    if min(fw, fh) < 20:
                        continue

                    match = engine_state.face_engine.match(f["embedding"])
                    faces.append({
                        "bbox_pct": f["bbox_pct"],
                        "bbox_pixel": f["bbox_pixel"],
                        "det_score": f["det_score"],
                        "tracking_id": matched_tracking_id,
                        "match": match,  # None => UNKNOWN PERSON
                    })

    return {"objects": objects, "faces": faces}


def build_timeline_text(analysis: Dict[str, Any]) -> Optional[str]:
    """
    Turns raw detections into a clean, grouped human-readable line
    (e.g. 'ram Detected', 'raja Detected | 2x Unknown Visitors', 'Car Detected').
    """
    parts = []
    recognized_names = []
    unknown_face_count = 0

    for f in analysis.get("faces", []):
        if f.get("match"):
            name = f["match"]["full_name"]
            if name not in recognized_names:
                recognized_names.append(name)
        else:
            unknown_face_count += 1

    for name in recognized_names:
        parts.append(f"{name} Detected")

    if unknown_face_count == 1:
        parts.append("Unknown Person Detected")
    elif unknown_face_count > 1:
        parts.append(f"{unknown_face_count}x Unknown Visitors Detected")

    has_face = (len(recognized_names) > 0 or unknown_face_count > 0)

    # Summarize ALL objects (vehicles, animals, persons if not covered by faces, things, nature)
    object_counts: Dict[str, int] = {}
    for o in analysis.get("objects", []):
        cls_name = o.get("class", "").lower()
        # If face is already listed, avoid duplicate person badge
        if cls_name == "person" and has_face:
            continue
        object_counts[cls_name] = object_counts.get(cls_name, 0) + 1

    for cls, count in object_counts.items():
        label = cls.replace("_", " ").title()
        parts.append(f"{label} Detected" if count == 1 else f"{count}x {label} Detected")

    return " | ".join(parts) if parts else None


def persist_video_frame(db: Session, video_id: str, frame_index: int, timestamp_seconds: float,
                         analysis: Dict[str, Any], frame_bgr: Optional[np.ndarray] = None,
                         video_start_time: Optional[datetime] = None,
                         camera_id: Optional[str] = None,
                         enable_attendance: bool = True,
                         shift_start_time: str = "09:00",
                         shift_end_time: str = "17:00") -> Optional[object]:
    """
    Writes one analyzed frame + its real detections into the DB
    (video_frames + detected_objects tables). Skips frames with nothing
    detected to avoid bloating storage with empty rows.

    Generates SnapshotEventDB entries and AlertDB entries for detected faces
    and notable objects, and fires automatic attendance for recognized staff.
    """
    timeline_text = build_timeline_text(analysis)
    if not analysis.get("objects") and not analysis.get("faces"):
        return None

    frame_row = crud.create_frame(
        db, video_id=video_id, frame_index=frame_index,
        timestamp_seconds=timestamp_seconds, timeline_text=timeline_text,
    )

    effective_cam_id = camera_id
    if not effective_cam_id or not crud.get_camera(db, effective_cam_id):
        effective_cam_id = crud.get_or_create_virtual_upload_camera(db).id

    now_anchor = (video_start_time + timedelta(seconds=timestamp_seconds)) if video_start_time else datetime.utcnow()

    # Save a single optimized HD snapshot for this frame once, and reuse its URL for all detections
    frame_snapshot_url = None
    if frame_bgr is not None and (analysis.get("faces") or analysis.get("objects")):
        frame_snapshot_url = save_snapshot(frame_bgr, effective_cam_id)

    for o in analysis.get("objects", []):
        crud.create_detected_object(
            db, frame_id=frame_row.id, type_=o["class"].upper(), label=o["class"],
            confidence=o["confidence"], bbox=o["bbox_pct"], tracking_id=o.get("tracking_id"),
        )
        if frame_snapshot_url and (o["class"] in NOTABLE_OBJECT_CLASSES or o["class"] == "person"):
            crud.create_snapshot(
                db, camera_id=effective_cam_id, event_type="OBJECT_DETECTED", severity="INFO",
                image_path=frame_snapshot_url, tracking_id=o.get("tracking_id"), confidence=o["confidence"],
                bbox=o["bbox_pct"], tags=[o["class"]],
            )

    for f in analysis.get("faces", []):
        if f.get("match"):
            emp_id = f["match"]["employee_id"]
            name = f["match"]["full_name"]
            crud.create_detected_object(
                db, frame_id=frame_row.id, type_="FACE", label=name,
                confidence=f["det_score"], bbox=f["bbox_pct"],
                face_person_id=emp_id, face_person_name=name,
                face_person_type="EMPLOYEE", face_confidence=f["match"]["confidence_percentage"],
            )
            if frame_snapshot_url:
                crud.create_snapshot(
                    db, camera_id=effective_cam_id, event_type="EMPLOYEE_RECOGNIZED", severity="INFO",
                    image_path=frame_snapshot_url, recognized_name=name,
                    confidence=f["match"]["confidence_percentage"], bbox=f["bbox_pct"], tags=["EMPLOYEE"],
                )
            if video_start_time is not None and enable_attendance:
                crud.record_face_checkin(
                    db, employee_id=emp_id, camera_id=camera_id, at=now_anchor,
                    shift_start_time=shift_start_time, shift_end_time=shift_end_time
                )
        else:
            crud.create_detected_object(
                db, frame_id=frame_row.id, type_="FACE", label="UNKNOWN PERSON",
                confidence=f["det_score"], bbox=f["bbox_pct"],
                face_person_name="UNKNOWN PERSON", face_person_type="UNKNOWN",
            )
            if frame_snapshot_url:
                crud.create_snapshot(
                    db, camera_id=effective_cam_id, event_type="UNKNOWN_PERSON", severity="MEDIUM",
                    image_path=frame_snapshot_url, recognized_name="UNKNOWN PERSON",
                    confidence=f["det_score"], bbox=f["bbox_pct"], tags=["UNKNOWN"],
                )
                crud.create_alert(
                    db, title="Unknown Person Detected",
                    message=f"An unrecognized face was seen at clip timestamp {timestamp_seconds:.1f}s.",
                    severity="WARNING", alert_type="UNKNOWN_PERSON", camera_id=effective_cam_id,
                    image_path=frame_snapshot_url,
                )

    return frame_row


def handle_live_events(db: Session, camera_id: str, frame_bgr: np.ndarray,
                        analysis: Dict[str, Any], record_attendance: bool = True,
                        shift_start_time: str = "09:00", shift_end_time: str = "17:00") -> List[dict]:
    """
    For a LIVE (camera/webcam) frame: creates real SnapshotEventDB rows for
    notable detections (unknown person, recognized employee), and - if
    record_attendance - fires real automatic attendance via
    crud.record_face_checkin() for any recognized employee. Snapshot images
    are the actual frame, saved to disk, not a placeholder.
    Returns a list of the snapshot/event summaries created (for the caller
    to push over a websocket if desired).
    """
    created = []
    now = datetime.utcnow()

    for f in analysis["faces"]:
        decision = identity_tracker.resolve(camera_id, f["match"], tracking_id=f.get("tracking_id"))

        if decision["action"] == "CONFIRMED_EMPLOYEE":
            match = decision["match"] or f["match"]
            emp_id = match["employee_id"]
            name = match["full_name"]
            image_url = save_snapshot(frame_bgr, camera_id)
            snap = crud.create_snapshot(
                db, camera_id=camera_id, event_type="EMPLOYEE_RECOGNIZED", severity="INFO",
                image_path=image_url, recognized_name=name, confidence=match["confidence_percentage"],
                bbox=f["bbox_pct"], tags=["EMPLOYEE"],
            )
            created.append({"type": "SNAPSHOT", "id": snap.id, "event_type": "EMPLOYEE_RECOGNIZED", "name": name})

            if record_attendance:
                crud.record_face_checkin(
                    db, employee_id=emp_id, camera_id=camera_id, at=now,
                    shift_start_time=shift_start_time, shift_end_time=shift_end_time
                )

        elif decision["action"] == "CONFIRMED_UNKNOWN":
            image_url = save_snapshot(frame_bgr, camera_id)
            snap = crud.create_snapshot(
                db, camera_id=camera_id, event_type="UNKNOWN_PERSON", severity="MEDIUM",
                image_path=image_url, recognized_name="UNKNOWN PERSON", confidence=f["det_score"],
                bbox=f["bbox_pct"], tags=["UNKNOWN"],
            )
            alert = crud.create_alert(
                db, title="Unknown Person Detected", message=f"An unrecognized face was seen on this camera.",
                severity="WARNING", alert_type="UNKNOWN_PERSON", camera_id=camera_id, image_path=image_url,
            )
            created.append({"type": "SNAPSHOT", "id": snap.id, "event_type": "UNKNOWN_PERSON"})
            created.append({"type": "ALERT", "id": alert.id, "event_type": "UNKNOWN_PERSON"})

            # Real WhatsApp/Email dispatch for this install's configured number/inbox.
            # Fired in a background thread with its OWN db session (SQLite sessions
            # aren't safe to share across threads) - CallMeBot/Gmail SMTP calls can
            # take several seconds or hang on a bad network, and the live-camera
            # request handler must respond immediately regardless of notification
            # latency. send_alert() itself never raises, so a failure in the
            # background thread can't crash anything either.
            local_image_path = _local_path_from_media_url(image_url)
            threading.Thread(
                target=_send_unknown_person_notification,
                args=(now, "live", local_image_path),
                daemon=True,
            ).start()

        # decision["action"] in ("PENDING", "ALREADY_CONFIRMED", "SUPPRESSED_UNKNOWN")
        # -> not enough votes yet, or already handled -> do nothing this frame

    for o in analysis["objects"]:
        if o["class"] in NOTABLE_OBJECT_CLASSES:
            image_url = save_snapshot(frame_bgr, camera_id)
            snap = crud.create_snapshot(
                db, camera_id=camera_id, event_type="OBJECT_DETECTED", severity="INFO",
                image_path=image_url, tracking_id=o["tracking_id"], confidence=o["confidence"],
                bbox=o["bbox_pct"], tags=[o["class"]],
            )
            created.append({"type": "SNAPSHOT", "id": snap.id, "event_type": "OBJECT_DETECTED", "name": o["class"]})

    return created
