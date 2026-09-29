import json
import logging
import re
import urllib.error
import urllib.request
import uuid
from typing import Any

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


def normalize_indian_phone(phone: str | None) -> str | None:
    """
    Normalize phone number to international E.164 format (+91XXXXXXXXXX).
    Handles 10-digit Indian mobile numbers, 12-digit numbers with 91 prefix,
    and already formatted +91 numbers.
    """
    if not phone:
        return None

    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(phone).strip())

    if (
        cleaned.startswith("+91")
        and len(cleaned) == 13
        and cleaned[3:].isdigit()
    ):
        return cleaned

    if cleaned.startswith("91") and len(cleaned) == 12 and cleaned.isdigit():
        return f"+{cleaned}"

    if len(cleaned) == 10 and cleaned.isdigit():
        return f"+91{cleaned}"

    # Other international numbers with country code
    if cleaned.startswith("+") and len(cleaned) >= 8 and cleaned[1:].isdigit():
        return cleaned

    return None


def send_sms(
    recipient_phone: str,
    content: str,
) -> dict[str, Any]:
    """
    Send transactional SMS via Brevo Transactional SMS API.
    POST https://api.brevo.com/v3/transactionalSMS/send
    Returns: {"success": bool, "provider": "brevo", "message_id":
    str | None, "error": str | None}
    """
    normalized_phone = normalize_indian_phone(recipient_phone)
    if not normalized_phone:
        return {
            "success": False,
            "provider": "brevo",
            "message_id": None,
            "error": f"Invalid recipient phone number format: "
                f"{recipient_phone}",
        }

    # 1. Brevo Sandbox Mode
    if settings.BREVO_SANDBOX_MODE:
        sandbox_id = f"sandbox-sms-{uuid.uuid4()}"
        logger.info(
            f"[BREVO SMS SANDBOX] To {normalized_phone}: "
            f"{content} [ID: {sandbox_id}]")
        return {
            "success": True,
            "provider": "brevo",
            "message_id": sandbox_id,
            "error": None,
        }

    # 2. Check configuration
    if not settings.BREVO_ENABLED or not settings.BREVO_SMS_ENABLED:
        return {
            "success": False,
            "provider": "brevo",
            "message_id": None,
            "error": "SMS delivery is disabled in configuration",
        }

    if not settings.BREVO_API_KEY:
        logger.info(
            f"Brevo API key not configured. Skipping SMS transmission "
                f"to {normalized_phone}.")
        return {
            "success": False,
            "provider": "brevo",
            "message_id": None,
            "error": "SMS provider credentials not configured",
        }

    # 3. Brevo Transactional SMS API Call
    url = "https://api.brevo.com/v3/transactionalSMS/send"
    sender = settings.BREVO_SMS_SENDER or "PolicyGPT"
    # Brevo restricts sender names to alphanumeric, max 11 chars
    sender_clean = re.sub(r"[^a-zA-Z0-9]", "", sender)[:11] or "PolicyGPT"

    payload = {
        "sender": sender_clean,
        "recipient": normalized_phone,
        "content": content[:160],  # Standard single SMS limit
        "type": "transactional",
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "api-key": settings.BREVO_API_KEY,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = json.loads(response.read().decode("utf-8"))
            message_id = str(res_body.get("messageId") or uuid.uuid4())
            return {
                "success": True,
                "provider": "brevo",
                "message_id": message_id,
                "error": None,
            }

    except urllib.error.HTTPError as http_err:
        err_msg = http_err.read().decode("utf-8", errors="ignore")
        logger.error(f"Brevo SMS API Error ({http_err.code}): {err_msg}")
        return {
            "success": False,
            "provider": "brevo",
            "message_id": None,
            "error": f"Brevo SMS API error: {http_err.code}",
        }
    except Exception as exc:
        logger.error(f"Brevo SMS unexpected error: {exc}")
        return {
            "success": False,
            "provider": "brevo",
            "message_id": None,
            "error": str(exc),
        }


# =========================================================
# OTP SMS (AUTHENTICATION - EXPLICIT CHANNEL ONLY)
# =========================================================

def send_otp_sms(recipient_phone: str, otp: str) -> dict[str, Any]:
    """Send authentication OTP via SMS. Never falls back to email.

    Returns the same result dict as send_sms().
    """
    content = (
        f"PolicyGPT: Your verification OTP is {otp}. "
        f"Valid for 5 minutes."
    )
    return send_sms(recipient_phone, content[:160])


# =========================================================
# CONCISE TEMPLATES (NO HTML, <160 CHARACTERS)
# =========================================================

def send_application_sms(
    recipient_phone: str,
    scheme_name: str,
    status: str,
) -> dict[str, Any]:
    short_scheme = (
        scheme_name[:30] + "..." if len(scheme_name) > 30 else scheme_name
    )
    content = (
        f"PolicyGPT: Your application for {short_scheme} is now "
        f"{status}. Login to portal for details."
    )
    return send_sms(recipient_phone, content)


def send_deadline_sms(
    recipient_phone: str,
    scheme_name: str,
    days_remaining: int,
) -> dict[str, Any]:
    short_scheme = (
        scheme_name[:30] + "..." if len(scheme_name) > 30 else scheme_name
    )
    content = (
        f"PolicyGPT Reminder: Application deadline for "
        f"{short_scheme} is in {days_remaining} day(s). "
        "Login for details."
    )
    return send_sms(recipient_phone, content)


def send_approval_sms(
    recipient_phone: str,
    item_type: str,
    item_id: int,
) -> dict[str, Any]:
    content = (
        f"PolicyGPT: {item_type} #{item_id} requires your "
        "review and approval. Login to official portal."
    )
    return send_sms(recipient_phone, content)


def send_alert_sms(recipient_phone: str, alert_title: str) -> dict[str, Any]:
    short_title = (
        alert_title[:45] + "..." if len(alert_title) > 45 else alert_title
    )
    content = (
        f"PolicyGPT Urgent Alert: {short_title}. Check "
        "notification center for instructions."
    )
    return send_sms(recipient_phone, content)
