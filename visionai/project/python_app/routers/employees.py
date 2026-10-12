from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
import engine_state
from database import get_db

router = APIRouter(prefix="/api/employees", tags=["Employees"])


@router.post("", response_model=schemas.EmployeeRead)
def create_employee(data: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    return crud.create_employee(db, data)


@router.get("", response_model=list[schemas.EmployeeRead])
def list_employees(department: str | None = None, status: str | None = None,
                    search: str | None = None, db: Session = Depends(get_db)):
    return crud.list_employees(db, department, status, search)


@router.get("/{employee_id}", response_model=schemas.EmployeeRead)
def get_employee(employee_id: str, db: Session = Depends(get_db)):
    obj = crud.get_employee(db, employee_id)
    if not obj:
        raise HTTPException(404, "Employee not found")
    return obj


@router.patch("/{employee_id}", response_model=schemas.EmployeeRead)
def update_employee(employee_id: str, data: schemas.EmployeeUpdate, db: Session = Depends(get_db)):
    obj = crud.update_employee(db, employee_id, data)
    if not obj:
        raise HTTPException(404, "Employee not found")
    return obj


@router.delete("/{employee_id}")
def delete_employee(employee_id: str, db: Session = Depends(get_db)):
    if not crud.delete_employee(db, employee_id):
        raise HTTPException(404, "Employee not found")
    engine_state.rebuild_face_index(db)  # their face embeddings cascade-deleted too
    return {"status": "DELETED", "id": employee_id}


@router.delete("/{employee_id}/faces/{embedding_id}")
def delete_face(employee_id: str, embedding_id: str, db: Session = Depends(get_db)):
    if not crud.delete_face_embedding(db, embedding_id):
        raise HTTPException(404, "Face embedding not found")
    engine_state.rebuild_face_index(db)  # keep the live matcher in sync with the DB
    return {"status": "DELETED", "id": embedding_id}

# NOTE: POST /{employee_id}/faces (image upload -> real embedding) is added
# in routers/face_recognition.py during Phase 1, once InsightFace is wired in -
# it is intentionally not stubbed here with a fake vector.
