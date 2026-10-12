"""
routers/attendance_policy.py
------------------------------
Kept deliberately separate from routers/attendance.py and routers/settings.py
so this feature is fully additive - editing shift times/toggling attendance
on or off can never touch or override anything another module's API does.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/settings/attendance-policy", tags=["Attendance Policy"])


@router.get("", response_model=schemas.AttendancePolicyRead)
def get_policy(db: Session = Depends(get_db)):
    return crud.get_attendance_policy(db)


@router.patch("", response_model=schemas.AttendancePolicyRead)
def update_policy(data: schemas.AttendancePolicyUpdate, db: Session = Depends(get_db)):
    """
    e.g. {"enabled": true, "shift_start_time": "10:00", "shift_end_time": "18:30",
          "late_grace_minutes": 5, "early_leave_grace_minutes": 15}
    """
    return crud.upsert_attendance_policy(db, data)
