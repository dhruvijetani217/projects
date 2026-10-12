"""
setup_notifications.py
------------------------
Run this ONCE right after installing VisionAI on a new server, so THIS
install's real alerts go to the installer's own WhatsApp + Gmail.
Usage: python3 setup_notifications.py
"""
from database import SessionLocal, init_db
import crud
import schemas


def main():
    print("=" * 60)
    print("VisionAI - Notification Setup (WhatsApp + Email)")
    print("=" * 60)

    init_db()
    db = SessionLocal()

    setup_wa = input("\nSetup WhatsApp alerts? (y/n): ").strip().lower() in ("y", "yes", "haa", "ha")
    wa_phone, wa_key = None, None
    if setup_wa:
        print("\nStep 1: Open WhatsApp on YOUR phone.")
        print("Step 2: Send this exact message to +34 644 51 95 23:")
        print("        I allow callmebot to send me messages")
        print("Step 3: Wait for their reply - it contains your API key.\n")
        input("Press Enter once you've done this and have your API key...")
        wa_phone = input("Your WhatsApp number with country code (e.g. 919876543210): ").strip()
        wa_key = input("The API key CallMeBot sent you: ").strip()

    setup_email = input("\nSetup Email alerts? (y/n): ").strip().lower() in ("y", "yes", "haa", "ha")
    email_addr, email_pass = None, None
    if setup_email:
        print("\nStep 1: Go to https://myaccount.google.com/apppasswords")
        print("Step 2: Generate an App Password (needs 2-Step Verification ON).")
        input("Press Enter once you have the 16-character App Password...")
        email_addr = input("Your Gmail address: ").strip()
        email_pass = input("The 16-character App Password: ").strip()

    data = schemas.NotificationSettingsUpdate(
        whatsapp_enabled=setup_wa, whatsapp_phone=wa_phone, whatsapp_apikey=wa_key,
        email_enabled=setup_email, email_address=email_addr, email_app_password=email_pass,
    )
    crud.upsert_notification_settings(db, data)
    db.close()

    print("\nSaved! Sending a test alert now...")
    import notifications
    wa_ok = notifications.send_whatsapp("VisionAI test - WhatsApp connected!") if setup_wa else None
    em_ok = notifications.send_email("VisionAI Test", "Email connected!") if setup_email else None

    if setup_wa:
        print(f"WhatsApp test: {'SENT' if wa_ok else 'FAILED - check phone/apikey'}")
    if setup_email:
        print(f"Email test: {'SENT' if em_ok else 'FAILED - check address/app password'}")

    print("\nDone. Alerts are now configured for this installation.")


if __name__ == "__main__":
    main()
