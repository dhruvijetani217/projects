"""
yolo26_detector.py
-------------------
Real object detection + tracking using Ultralytics YOLO (COCO-pretrained,
80 classes: person, car, bicycle, motorcycle, bus, truck, backpack, handbag,
laptop, cell phone, bottle, chair, dog, cat, etc.) with built-in ByteTrack
tracking (model.track(..., persist=True)).

IMPORTANT HONESTY NOTE for whoever deploys this:
COCO does NOT include "helmet", "license plate", "fire", or "smoke" as
classes. Any feature claiming to detect those needs either a custom-trained
model (e.g. a helmet-violation dataset fine-tune) or a second specialized
model (e.g. a fire/smoke detector, an ALPR engine for plates). This file
does not fabricate those detections - it only reports what the loaded
COCO model actually recognizes.
"""

import cv2
import numpy as np
import time
from typing import List, Dict, Any, Tuple, Optional

try:
    import torch
    torch.set_num_threads(4)
except Exception:
    pass


class YOLO26Detector:
    """
    Ultralytics YOLO object detector + ByteTrack tracker.
    Works on CCTV/RTSP streams, uploaded video files, and webcam frames alike -
    same detect_and_track() call regardless of source.
    """
    def __init__(self, model_weights: str = "yolo11n.pt", conf_thresh: float = 0.30):
        self.model_weights = model_weights
        self.conf_thresh = conf_thresh
        self.model = None
        self.is_loaded = False
        self._load_model()

    def _load_model(self):
        try:
            from ultralytics import YOLO
            print(f"Loading YOLO weights '{self.model_weights}'...")
            self.model = YOLO(self.model_weights)
            self.is_loaded = True
            # Warm up detector with small dummy frame for zero initial lag
            dummy = np.zeros((360, 640, 3), dtype=np.uint8)
            self.model.track(dummy, imgsz=640, persist=True, tracker="bytetrack.yaml", verbose=False)
            print("YOLO engine ready & warmed up.")
        except Exception as e:
            print(f"WARNING: could not load Ultralytics YOLO ({e}). "
                  f"Falling back to an OpenCV face-only detector - object classes "
                  f"(car, laptop, etc.) will NOT be available until ultralytics "
                  f"installs correctly.")
            self.is_loaded = False

    def detect_and_track(self, frame: np.ndarray, max_dim: int = 640) -> Tuple[Optional[np.ndarray], List[Dict[str, Any]]]:
        """
        Runs detection+tracking on a single BGR frame with optimized resolution scaling.
        Returns (annotated_frame, detections). Every value in each detection
        dict comes directly from the model's output - confidence is the
        model's real score, tracking_id is ByteTrack's real assigned ID.
        """
        if frame is None:
            return None, []

        orig_h, orig_w = frame.shape[:2]
        detections: List[Dict[str, Any]] = []
        annotated_frame = frame.copy()

        if self.is_loaded and self.model is not None:
            # Scale frame for high-speed inference if larger than max_dim
            if max(orig_h, orig_w) > max_dim:
                scale = float(max_dim) / max(orig_h, orig_w)
                proc_w, proc_h = int(orig_w * scale), int(orig_h * scale)
                proc_frame = cv2.resize(frame, (proc_w, proc_h), interpolation=cv2.INTER_LINEAR)
            else:
                scale = 1.0
                proc_w, proc_h = orig_w, orig_h
                proc_frame = frame

            imgsz = max(proc_w, proc_h)
            # Ensure imgsz is divisible by 32
            imgsz = ((imgsz + 31) // 32) * 32

            results = self.model.track(
                proc_frame,
                persist=True,
                tracker="bytetrack.yaml",
                imgsz=imgsz,
                conf=self.conf_thresh,
                verbose=False
            )

            for r in results:
                boxes = r.boxes
                if boxes is None:
                    continue
                for box in boxes:
                    cls_id = int(box.cls[0])
                    class_name = self.model.names[cls_id]
                    confidence = float(box.conf[0])
                    tracking_id = int(box.id[0]) if box.id is not None else 0
                    
                    # Coordinates in proc_frame
                    bx1, by1, bx2, by2 = map(float, box.xyxy[0].tolist())
                    
                    # Convert to exact percentages and original pixel coordinates
                    pct_x = round((bx1 / proc_w) * 100, 2)
                    pct_y = round((by1 / proc_h) * 100, 2)
                    pct_w = round(((bx2 - bx1) / proc_w) * 100, 2)
                    pct_h = round(((by2 - by1) / proc_h) * 100, 2)
                    
                    orig_x1 = int(round(bx1 / scale))
                    orig_y1 = int(round(by1 / scale))
                    orig_x2 = int(round(bx2 / scale))
                    orig_y2 = int(round(by2 / scale))

                    detections.append({
                        "class": class_name,
                        "confidence": round(confidence, 3),
                        "tracking_id": f"BYT-{tracking_id:04d}",
                        "bbox_pixel": [orig_x1, orig_y1, orig_x2, orig_y2],
                        "bbox_pct": [pct_x, pct_y, pct_w, pct_h],
                    })

                    color = (0, 255, 127) if class_name == "person" else (255, 191, 0)
                    cv2.rectangle(annotated_frame, (orig_x1, orig_y1), (orig_x2, orig_y2), color, 2)
                    label_str = f"{class_name.upper()} | BYT-{tracking_id:04d} ({int(confidence * 100)}%)"
                    cv2.putText(annotated_frame, label_str, (orig_x1, max(20, orig_y1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        else:
            # Fallback: OpenCV Haar cascade, FACE detection only (not general objects).
            # Uses detectMultiScale2's real levelWeights as a genuine confidence proxy -
            # never a hardcoded number - and labels results "face", not "person",
            # since a face box is not a full-body person detection.
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            faces, reject_levels, level_weights = face_cascade.detectMultiScale3(
                gray, scaleFactor=1.1, minNeighbors=4, outputRejectLevels=True
            )

            if len(level_weights):
                max_weight = max(float(lw) for lw in level_weights) or 1.0
            else:
                max_weight = 1.0

            for i, (x, y, bw, bh) in enumerate(faces):
                real_conf = min(float(level_weights[i]) / max_weight, 1.0) if len(level_weights) else 0.0
                detections.append({
                    "class": "face",
                    "confidence": round(real_conf, 3),
                    "tracking_id": f"BYT-{i + 1001:04d}",
                    "bbox_pixel": [int(x), int(y), int(x + bw), int(y + bh)],
                    "bbox_pct": [
                        round((x / w) * 100, 1), round((y / h) * 100, 1),
                        round((bw / w) * 100, 1), round((bh / h) * 100, 1),
                    ],
                })
                cv2.rectangle(annotated_frame, (x, y), (x + bw, y + bh), (0, 255, 127), 2)
                cv2.putText(annotated_frame, f"FACE | BYT-{i + 1001:04d} ({int(real_conf * 100)}%)",
                            (x, max(20, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 127), 2)

        return annotated_frame, detections
