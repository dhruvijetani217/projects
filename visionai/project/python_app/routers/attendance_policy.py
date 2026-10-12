"""
routers/attendance_policy.py
------------------------------
Dedicated router for office shift hours, late grace minutes, and attendance policy.
Persisted directly to the database in system_settings.
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
@router.put("", response_model=schemas.AttendancePolicyRead)
def update_policy(data: schemas.AttendancePolicyUpdate, db: Session = Depends(get_db)):
    """
    Updates office shift hours in database, e.g.:
    {"enabled": true, "shift_start_time": "09:00", "shift_end_time": "17:00", "late_grace_minutes": 15}
    """
    return crud.upsert_attendance_policy(db, data)
