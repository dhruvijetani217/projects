from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


@router.get("", response_model=list[schemas.AttendanceRead])
def list_attendance(employee_id: str | None = None, date: str | None = None, db: Session = Depends(get_db)):
    return crud.list_attendance(db, employee_id, date)


@router.get("/by-date/{date}", response_model=list[schemas.AttendanceRecordWithAbsences])
def list_attendance_by_date(date: str, db: Session = Depends(get_db)):
    """
    Real attendance rows for `date` (YYYY-MM-DD) PLUS computed ABSENT entries
    for every registered-face employee with no detection that day. Separate
    endpoint from the plain GET above so nothing existing changes behavior -
    this is additive only.
    """
    return crud.list_attendance_for_date_with_absences(db, date)


@router.post("/manual", response_model=schemas.AttendanceRead)
def manual_attendance(data: schemas.AttendanceManualCreate, db: Session = Depends(get_db)):
    """HR admin manual override - real row, marked verification_method=MANUAL_OVERRIDE."""
    if not crud.get_employee(db, data.employee_id):
        raise HTTPException(404, "Employee not found")
    return crud.create_manual_attendance(db, data)

# NOTE: automatic FACE_RECOGNITION check-in/out happens via
# crud.record_face_checkin(), called from the live-camera/video pipeline
# in Phase 2 whenever a face match event fires - not exposed as a manual API.
