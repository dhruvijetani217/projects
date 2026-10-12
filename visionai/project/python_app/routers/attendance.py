from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


@router.get("", response_model=list[schemas.AttendanceRead])
def list_attendance(employee_id: str | None = None, date: str | None = None, db: Session = Depends(get_db)):
    return crud.list_attendance(db, employee_id, date)


@router.post("/manual", response_model=schemas.AttendanceRead)
def manual_attendance(data: schemas.AttendanceManualCreate, db: Session = Depends(get_db)):
    """HR admin manual override - real row, marked verification_method=MANUAL_OVERRIDE."""
    if not crud.get_employee(db, data.employee_id):
        raise HTTPException(404, "Employee not found")
    return crud.create_manual_attendance(db, data)

from routers.live_camera import get_live_active_employees


@router.get("/live-active")
def list_live_active_employees():
    """Returns employees currently seen live on camera feeds within the last 15 seconds."""
    return get_live_active_employees(seconds=15.0)


@router.delete("/{id}")
def delete_attendance_record(id: str, db: Session = Depends(get_db)):
    """Deletes one attendance record by ID."""
    if not crud.delete_attendance(db, id):
        raise HTTPException(404, "Attendance record not found")
    return {"status": "DELETED", "id": id}

@router.get("/summary")
def employee_time_summary(
    employee_id: str,
    period: str = "week",
    ref_date: str | None = None,
    db: Session = Depends(get_db),
):
    """Total time an employee was seen on camera, grouped by day/week/month/year."""
    result = crud.get_employee_time_summary(db, employee_id, period, ref_date)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result