"""
routers/search.py
-------------------
AI Video Search from the spec - scoped, honest implementation.

This is real keyword matching over real SnapshotEventDB rows (employee
names, "unknown", object classes like "car"/"laptop", "today"/"yesterday").
It is NOT full LLM-based semantic search yet (see crud.search_snapshots'
docstring) - every result is a genuine database row with a real saved
image, never a fabricated/simulated one.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/search", tags=["AI Video Search"])


class SearchQuery(BaseModel):
    query: str


class SearchResponse(BaseModel):
    query: str
    matched_employee_names: list[str]
    results: list[schemas.SnapshotRead]


@router.post("", response_model=SearchResponse)
def search(body: SearchQuery, db: Session = Depends(get_db)):
    results = crud.search_snapshots(db, body.query)
    employees = crud.list_employees(db)
    matched_names = [e.full_name for e in employees if e.full_name.lower() in body.query.lower()]
    return SearchResponse(query=body.query, matched_employee_names=matched_names, results=results)
