"""
routers/face_recognition.py
----------------------------
Real face registration, multi-angle biometric validation, and identification endpoints.

Features:
- POST /api/employees/{employee_id}/faces
  Registers a face photo with strict blur and quality validation. Rejects blurry/low-res images.
- POST /api/employees/{employee_id}/faces/batch
  Registers multiple multi-angle face photos (Front, Left, Right, Tilt) in one request.
- POST /api/face-recognition/validate
  Real-time image pre-validation (checks blur, sharpness, face size, detection confidence).
- POST /api/face-recognition/identify
  Matches every detected face in an image against the FAISS vector index.
- POST /api/face-recognition/reindex
  Rebuilds FAISS index from SQLite database.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session

import crud
import schemas
import engine_state
from database import get_db
from media_storage import read_image_from_bytes, save_face_crop

router = APIRouter(tags=["Face Recognition"])


@router.post("/api/face-recognition/validate")
async def validate_face_image(
    file: UploadFile = File(...),
    pose_tag: str = Form("FRONT")
):
    """
    Real-time pre-validation endpoint: analyzes photo quality, sharpness,
    blur level, clarity percentage, and face presence BEFORE final save.
    """
    contents = await file.read()
    image = read_image_from_bytes(contents)
    if image is None:
        return {
            "valid": False,
            "message": "Could not decode image file. Please upload a standard JPG/PNG image.",
            "sharpness": 0.0,
            "clarity_percent": 0,
            "face_detected": False,
            "det_score": 0.0,
            "face_width": 0,
            "face_height": 0,
            "brightness": 0.0,
            "pose_tag": pose_tag,
            "issues": ["Invalid image format"],
        }

    is_valid, face, msg, quality = engine_state.face_engine.validate_photo_for_enrollment(image, pose_tag=pose_tag)
    return {
        "valid": is_valid,
        "message": msg,
        "sharpness": quality.get("sharpness_score", 0.0),
        "clarity_percent": quality.get("clarity_percent", 0),
        "face_detected": face is not None,
        "det_score": quality.get("det_score", 0.0),
        "face_width": quality.get("face_width", 0),
        "face_height": quality.get("face_height", 0),
        "brightness": quality.get("brightness", 0.0),
        "pose_tag": pose_tag,
        "issues": quality.get("issues", []),
    }


@router.post("/api/employees/{employee_id}/faces", response_model=schemas.FaceEmbeddingRead)
async def register_face(
    employee_id: str,
    file: UploadFile = File(...),
    pose_tag: str = Form("FRONT"),
    db: Session = Depends(get_db)
):
    """
    Real enrollment: uploads a single photo, runs AI blur + quality validation,
    extracts 512-d normalized embeddings with CCTV angle variations, saves the portrait crop, and updates FAISS in <1ms.
    """
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")

    contents = await file.read()
    image = read_image_from_bytes(contents)
    if image is None:
        raise HTTPException(400, "Could not decode image file")

    is_valid, face, error_msg, quality = engine_state.face_engine.validate_photo_for_enrollment(image, pose_tag=pose_tag)
    if not is_valid or face is None:
        raise HTTPException(422, detail=error_msg)

    image_url = save_face_crop(image, face["bbox_pixel"], employee_id)

    # Precompute calibrated perspective and illumination augmentations once
    vectors = engine_state.face_engine.extract_perspective_augmented_embeddings(image, base_face=face)
    if not vectors:
        vectors = [face["embedding"]]

    obj = crud.add_face_embedding(
        db,
        employee_id=employee_id,
        vector=vectors,
        image_url=image_url,
        bbox=face["bbox_pct"],
        quality_score=face["det_score"],
        pose_tag=pose_tag,
        sharpness_score=quality.get("sharpness_score", 0.0),
    )

    # Keep the live matcher in sync with what's now in the DB (<1ms).
    engine_state.rebuild_face_index(db)

    return obj


@router.post("/api/employees/{employee_id}/faces/batch")
async def register_multiple_faces(
    employee_id: str,
    files: List[UploadFile] = File(...),
    pose_tags: Optional[List[str]] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Enrolls multiple multi-angle face photos (e.g. Front, Left, Right, Tilt)
    in a single request. Validates each image individually.
    """
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")

    if not files:
        raise HTTPException(400, "No image files provided for enrollment")

    enrolled = []
    warnings = []

    # Map pose_tags list to file indices if provided
    tags_list = pose_tags if pose_tags else []

    for idx, file in enumerate(files):
        tag = tags_list[idx] if idx < len(tags_list) else "FRONT"
        contents = await file.read()
        image = read_image_from_bytes(contents)
        if image is None:
            warnings.append(f"[{tag}] {file.filename}: Could not decode image.")
            continue

        is_valid, face, msg, quality = engine_state.face_engine.validate_photo_for_enrollment(image, pose_tag=tag)
        if not is_valid or face is None:
            warnings.append(f"[{tag}] {file.filename}: {msg}")
            continue

        image_url = save_face_crop(image, face["bbox_pixel"], employee_id)

        # Precompute calibrated perspective and illumination augmentations once
        vectors = engine_state.face_engine.extract_perspective_augmented_embeddings(image, base_face=face)
        if not vectors:
            vectors = [face["embedding"]]

        obj = crud.add_face_embedding(
            db,
            employee_id=employee_id,
            vector=vectors,
            image_url=image_url,
            bbox=face["bbox_pct"],
            quality_score=face["det_score"],
            pose_tag=tag,
            sharpness_score=quality.get("sharpness_score", 0.0),
        )
        enrolled.append({
            "id": obj.id,
            "image_url": obj.image_url,
            "pose_tag": tag,
            "quality_score": obj.quality_score,
            "sharpness": quality.get("sharpness_score", 0.0),
            "clarity_percent": quality.get("clarity_percent", 0),
        })

    if enrolled:
        engine_state.rebuild_face_index(db)

    if not enrolled and warnings:
        raise HTTPException(422, detail="All uploaded photos failed validation: " + " | ".join(warnings))

    return {
        "employee_id": employee_id,
        "enrolled_count": len(enrolled),
        "enrolled_faces": enrolled,
        "warnings": warnings,
    }


@router.post("/api/face-recognition/identify")
async def identify_faces(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Real identification: every face found in the uploaded image is matched
    against the FAISS index of enrolled employees. Faces below the match
    threshold come back as UNKNOWN_PERSON.
    """
    contents = await file.read()
    image = read_image_from_bytes(contents)
    if image is None:
        raise HTTPException(400, "Could not decode image file")

    faces = engine_state.face_engine.detect_faces(image, max_dim=1280)
    results = []
    for f in faces:
        match = engine_state.face_engine.match(f["embedding"])
        if match:
            employee = crud.get_employee(db, match["employee_id"])
            results.append({
                "bbox_pct": f["bbox_pct"],
                "det_score": f["det_score"],
                "person_type": "EMPLOYEE",
                "employee_id": match["employee_id"],
                "full_name": match["full_name"],
                "department": employee.department if employee else None,
                "confidence": match["confidence_percentage"],
            })
        else:
            results.append({
                "bbox_pct": f["bbox_pct"],
                "det_score": f["det_score"],
                "person_type": "UNKNOWN",
                "employee_id": None,
                "full_name": "UNKNOWN PERSON",
                "department": None,
                "confidence": None,
            })

    return {"faces_found": len(faces), "results": results}


@router.post("/api/face-recognition/reindex")
def reindex(db: Session = Depends(get_db)):
    """Manually force a FAISS rebuild from the DB - useful after bulk imports."""
    count = engine_state.rebuild_face_index(db)
    return {"status": "REINDEXED", "vectors_indexed": count}
