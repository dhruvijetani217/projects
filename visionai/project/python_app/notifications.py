"""
notifications.py
------------------
Sends REAL WhatsApp (via CallMeBot, free) and Email (via Gmail SMTP, free)
alerts. Reads the destination phone/email + credentials from the
NotificationSettingsDB singleton row that THIS installer configured once
during setup (see setup_notifications.py / the Notification Settings page
in the frontend) - so every install sends alerts to that specific user's
own WhatsApp/Gmail, never a shared/hardcoded one.
"""
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

import requests
from sqlalchemy.orm import Session

import crud


def send_whatsapp(db: Session, message: str) -> bool:
    settings = crud.get_notification_settings(db)
    if not settings or not settings.whatsapp_enabled:
        return False
    if not settings.whatsapp_phone or not settings.whatsapp_apikey:
        return False
    try:
        url = "https://api.callmebot.com/whatsapp.php"
        params = {"phone": settings.whatsapp_phone, "text": message, "apikey": settings.whatsapp_apikey}
        resp = requests.get(url, params=params, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"WhatsApp send failed: {e}")
        return False


def send_email(db: Session, subject: str, body: str, image_path: str = None) -> bool:
    """
    image_path: optional local filesystem path to a snapshot JPEG to attach
    (the real saved file behind a /media/snapshots/... URL) - real photo
    evidence, not just text, for unknown-person alerts.
    """
    settings = crud.get_notification_settings(db)
    if not settings or not settings.email_enabled:
        return False
    if not settings.email_address or not settings.email_app_password:
        return False
    try:
        msg = MIMEMultipart()
        msg["Subject"] = subject
        msg["From"] = settings.email_address
        msg["To"] = settings.email_address
        msg.attach(MIMEText(body))

        if image_path and os.path.exists(image_path):
            with open(image_path, "rb") as img_f:
                img = MIMEImage(img_f.read())
                img.add_header("Content-Disposition", "attachment", filename=os.path.basename(image_path))
                msg.attach(img)

        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(settings.email_address, settings.email_app_password)
            server.sendmail(settings.email_address, settings.email_address, msg.as_string())
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False


def send_alert(db: Session, title: str, message: str, image_path: str = None) -> None:
    """
    Fires both channels (whichever are enabled). Never raises - a
    notification failure must never break the underlying detection/alert
    flow it's attached to.
    """
    try:
        send_whatsapp(db, f"*{title}*\n{message}")
    except Exception as e:
        print(f"send_alert whatsapp branch failed: {e}")
    try:
        send_email(db, title, message, image_path=image_path)
    except Exception as e:
        print(f"send_alert email branch failed: {e}")
