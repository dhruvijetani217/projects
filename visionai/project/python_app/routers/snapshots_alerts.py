from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(tags=["Snapshots & Alerts"])


@router.get("/api/snapshots", response_model=list[schemas.SnapshotRead])
def list_snapshots(camera_id: str | None = None, event_type: str | None = None,
                    limit: int | None = 5000, db: Session = Depends(get_db)):
    return crud.list_snapshots(db, camera_id, event_type, limit)


@router.post("/api/snapshots/{snapshot_id}/acknowledge", response_model=schemas.SnapshotRead)
def acknowledge_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    obj = crud.acknowledge_snapshot(db, snapshot_id)
    if not obj:
        raise HTTPException(404, "Snapshot not found")
    return obj


@router.delete("/api/snapshots/{snapshot_id}")
def delete_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    """Real delete: removes the DB row AND the saved image file on disk."""
    if not crud.delete_snapshot(db, snapshot_id):
        raise HTTPException(404, "Snapshot not found")
    return {"status": "DELETED", "id": snapshot_id}


@router.delete("/api/snapshots")
def bulk_delete_snapshots(
    before_date: str | None = None,
    after_date: str | None = None,
    camera_id: str | None = None,
    all: bool = False,
    db: Session = Depends(get_db),
):
    """
    Bulk delete for retention/cleanup (e.g. 'delete everything older than
    2026-01-01' or 'wipe this camera's evidence'). Requires at least one of
    before_date/after_date/camera_id, or all=true - a bare call with no
    filter and no all=true deletes nothing, on purpose, to avoid an
    accidental full wipe from a missing query param.
    Dates are ISO format, e.g. before_date=2026-01-01.
    """
    if not all and not (before_date or after_date or camera_id):
        raise HTTPException(400, "Provide before_date, after_date, camera_id, or set all=true")
    count = crud.delete_snapshots_bulk(db, before_date=before_date, after_date=after_date,
                                        camera_id=camera_id, all_=all)
    return {"status": "DELETED", "count": count}


@router.get("/api/alerts", response_model=list[schemas.AlertRead])
def list_alerts(unread_only: bool = False, limit: int | None = 5000, db: Session = Depends(get_db)):
    return crud.list_alerts(db, unread_only, limit)


@router.post("/api/alerts/{alert_id}/read", response_model=schemas.AlertRead)
def mark_alert_read(alert_id: str, db: Session = Depends(get_db)):
    obj = crud.mark_alert_read(db, alert_id)
    if not obj:
        raise HTTPException(404, "Alert not found")
    return obj


@router.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id: str, db: Session = Depends(get_db)):
    if not crud.delete_alert(db, alert_id):
        raise HTTPException(404, "Alert not found")
    return {"status": "DELETED", "id": alert_id}


@router.delete("/api/alerts")
def bulk_delete_alerts(
    before_date: str | None = None,
    after_date: str | None = None,
    all: bool = False,
    db: Session = Depends(get_db),
):
    """Same retention-cleanup pattern as snapshots - see bulk_delete_snapshots docstring."""
    if not all and not (before_date or after_date):
        raise HTTPException(400, "Provide before_date, after_date, or set all=true")
    count = crud.delete_alerts_bulk(db, before_date=before_date, after_date=after_date, all_=all)
    return {"status": "DELETED", "count": count}
