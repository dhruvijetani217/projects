from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import crud
from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    """
    Every number here is computed live from the DB via crud.dashboard_summary -
    present/absent/late are derived from today's real attendance_records rows,
    camera counts from real cameras.status. Nothing is hardcoded.
    """
    return crud.dashboard_summary(db)


@router.get("/analytics")
def analytics(db: Session = Depends(get_db)):
    """
    Live analytical breakdowns and distributions computed directly
    from real uploaded video detections, live frames, attendance records,
    and camera statistics.
    """
    return crud.get_analytics_summary(db)
