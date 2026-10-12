from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/visitors", tags=["Visitors"])


@router.post("", response_model=schemas.VisitorRead)
def create_visitor(data: schemas.VisitorCreate, db: Session = Depends(get_db)):
    return crud.create_visitor(db, data)


@router.get("", response_model=list[schemas.VisitorRead])
def list_visitors(category: str | None = None, db: Session = Depends(get_db)):
    return crud.list_visitors(db, category)


@router.post("/{visitor_id}/checkout", response_model=schemas.VisitorRead)
def checkout_visitor(visitor_id: str, db: Session = Depends(get_db)):
    obj = crud.checkout_visitor(db, visitor_id)
    if not obj:
        raise HTTPException(404, "Visitor not found")
    return obj


@router.patch("/{visitor_id}/category", response_model=schemas.VisitorRead)
def set_category(visitor_id: str, category: str, db: Session = Depends(get_db)):
    if category not in ("REGULAR", "VIP", "BLACK_LISTED", "UNKNOWN"):
        raise HTTPException(400, "Invalid category")
    obj = crud.set_visitor_category(db, visitor_id, category)
    if not obj:
        raise HTTPException(404, "Visitor not found")
    return obj
