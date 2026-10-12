from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db
import notifications

router = APIRouter(prefix="/api/settings", tags=["System & Notification Settings"])


# ---------------------------------------------------------------------------
# Global System Settings (Database Persisted: Surveillance Domain & UI Mode)
# ---------------------------------------------------------------------------

@router.get("/system", response_model=schemas.SystemSettingsRead)
def get_system_settings(db: Session = Depends(get_db)):
    return crud.get_system_settings(db)


@router.patch("/system", response_model=schemas.SystemSettingsRead)
@router.put("/system", response_model=schemas.SystemSettingsRead)
def update_system_settings(data: schemas.SystemSettingsUpdate, db: Session = Depends(get_db)):
    return crud.update_system_settings(db, data)


# ---------------------------------------------------------------------------
# Notification Settings (WhatsApp / Email alerts)
# ---------------------------------------------------------------------------

@router.get("/notifications", response_model=schemas.NotificationSettingsRead)
def get_notification_settings(db: Session = Depends(get_db)):
    obj = crud.get_notification_settings(db)
    if not obj:
        obj = crud.upsert_notification_settings(db, schemas.NotificationSettingsUpdate())
    return obj


@router.patch("/notifications", response_model=schemas.NotificationSettingsRead)
@router.put("/notifications", response_model=schemas.NotificationSettingsRead)
def update_notification_settings(data: schemas.NotificationSettingsUpdate, db: Session = Depends(get_db)):
    return crud.upsert_notification_settings(db, data)


@router.post("/notifications/test")
def test_notifications():
    """Sends a real test WhatsApp + Email right now using the saved settings."""
    wa = notifications.send_whatsapp("VisionAI test alert - WhatsApp is connected!")
    em = notifications.send_email("VisionAI Test Alert", "Email alerts are connected and working.")
    return {"whatsapp_sent": wa, "email_sent": em}
