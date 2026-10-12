"""
media_storage.py
-----------------
Saves real uploaded/cropped image bytes to disk under STORAGE_DIR and
returns a URL path the frontend can load directly (mounted as static files
in main.py). No placeholder image URLs are ever generated here.
"""

import os
import time
import uuid
import cv2
import numpy as np

STORAGE_DIR = os.getenv("STORAGE_DIR", os.path.join(os.path.dirname(__file__), "storage"))
FACES_DIR = os.path.join(STORAGE_DIR, "faces")
SNAPSHOTS_DIR = os.path.join(STORAGE_DIR, "snapshots")
UPLOADS_DIR = os.path.join(STORAGE_DIR, "uploads")
CLIPS_DIR = os.path.join(STORAGE_DIR, "clips")

for d in (FACES_DIR, SNAPSHOTS_DIR, UPLOADS_DIR, CLIPS_DIR):
    os.makedirs(d, exist_ok=True)


def save_face_crop(image_bgr: np.ndarray, bbox_pixel: list, employee_id: str, margin_pct: float = 0.20) -> str:
    """
    Crops the detected face region out of the source image with generous portrait
    margin (20%) and saves it at high quality. Ensures minimum 112x112 resolution for ArcFace.
    Returns a /media/faces/{employee_id}/{filename} URL path.
    """
    x1, y1, x2, y2 = [int(max(0, v)) for v in bbox_pixel]
    h, w = image_bgr.shape[:2]

    # Add margin around face for better portrait framing
    box_w = max(1, x2 - x1)
    box_h = max(1, y2 - y1)
    pad_x = int(box_w * margin_pct)
    pad_y = int(box_h * margin_pct)

    crop_x1 = max(0, x1 - pad_x)
    crop_y1 = max(0, y1 - pad_y)
    crop_x2 = min(w, x2 + pad_x)
    crop_y2 = min(h, y2 + pad_y)

    crop = image_bgr[crop_y1:crop_y2, crop_x1:crop_x2]
    if crop.size == 0:
        crop = image_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        crop = image_bgr  # fallback: store the whole frame rather than crash

    ch, cw = crop.shape[:2]
    if max(ch, cw) < 112:
        scale = 112.0 / max(ch, cw)
        crop = cv2.resize(crop, (max(112, int(cw * scale)), max(112, int(ch * scale))), interpolation=cv2.INTER_CUBIC)

    emp_dir = os.path.join(FACES_DIR, employee_id)
    os.makedirs(emp_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex[:10]}.jpg"
    path = os.path.join(emp_dir, filename)
    cv2.imwrite(path, crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    return f"/media/faces/{employee_id}/{filename}"


def save_snapshot(image_bgr: np.ndarray, camera_id: str) -> str:
    cam_dir = os.path.join(SNAPSHOTS_DIR, camera_id)
    os.makedirs(cam_dir, exist_ok=True)
    filename = f"{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
    path = os.path.join(cam_dir, filename)

    h, w = image_bgr.shape[:2]
    if max(h, w) > 1280:
        scale = 1280.0 / max(h, w)
        out_img = cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        out_img = image_bgr

    cv2.imwrite(path, out_img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    return f"/media/snapshots/{camera_id}/{filename}"


def read_image_from_bytes(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)
