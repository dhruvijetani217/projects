from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/leaves", tags=["Leave Management"])


@router.post("", response_model=schemas.LeaveRead)
def apply_leave(data: schemas.LeaveCreate, db: Session = Depends(get_db)):
    if not crud.get_employee(db, data.employee_id):
        raise HTTPException(404, "Employee not found")
    return crud.create_leave(db, data)


@router.get("", response_model=list[schemas.LeaveRead])
def list_leaves(employee_id: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    return crud.list_leaves(db, employee_id, status)


@router.patch("/{leave_id}/decision", response_model=schemas.LeaveRead)
def decide_leave(leave_id: str, data: schemas.LeaveDecision, db: Session = Depends(get_db)):
    if data.status not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "status must be APPROVED or REJECTED")
    obj = crud.decide_leave(db, leave_id, data)
    if not obj:
        raise HTTPException(404, "Leave request not found")
    return obj
