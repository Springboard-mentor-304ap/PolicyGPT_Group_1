import logging
from typing import Any

from app.core.config import settings
from app.services.sms_service import normalize_indian_phone

logger = logging.getLogger("uvicorn.error")

#: Provider label for Twilio Verify OTP sends. Distinct from the Messaging
#: ``"twilio"`` label so delivery records and callers can never confuse a
#: Verify acceptance with a Messaging send.
VERIFY_PROVIDER = "twilio-verify"

#: Clear, safe message for the Twilio Trial verified-recipient restriction.
TRIAL_UNVERIFIED_MESSAGE = (
    "SMS verification requires this phone number to be verified "
    "in the Twilio Trial account."
)


def _mask_phone(phone: str | None) -> str:
    """Mask a phone number for safe logging (e.g. +91******5206)."""
    if not phone:
        return "<none>"
    digits = str(phone)
    if len(digits) <= 7:
        return "*******"
    return f"{digits[:3]}******{digits[-4:]}"


def _verify_settings() -> dict[str, str]:
    """Read Twilio Verify configuration (never hard-coded)."""
    return {
        "account_sid": (settings.TWILIO_ACCOUNT_SID or "").strip(),
        "api_key": (settings.TWILIO_API_KEY or "").strip(),
        "api_secret": (settings.TWILIO_API_SECRET or "").strip(),
        "service_sid": (settings.TWILIO_VERIFY_SERVICE_SID or "").strip(),
    }


def _redact(message: str, cfg: dict[str, str]) -> str:
    """Strip configured secrets from a provider message (defensive).

    Twilio error texts never echo credentials, but this guarantees none
    can leak into logs or API responses even if a message ever did.
    """
    for secret_value in (
        cfg["api_key"],
        cfg["api_secret"],
        cfg["account_sid"],
        cfg["service_sid"],
    ):
        if secret_value and secret_value in message:
            message = message.replace(secret_value, "[redacted]")
    return " ".join(message.split())[:300]


def start_sms_verification(recipient_phone: str) -> dict[str, Any]:
    """Start a Twilio Verify SMS verification (trial-approved OTP template).

    The OTP itself is generated and owned by Twilio Verify — no local OTP
    is created or stored here. ``channel`` is always ``"sms"`` and the
    Verify sender is controlled by Twilio (there is no Messaging sender
    on this path; SMS is OTP-only).

    Returns: {"success": bool, "provider": "twilio-verify",
        "verification_sid": str | None, "status": str | None,
        "error": str | None}
    A successful API response means *accepted/sent*, never *delivered*.
    """
    normalized_phone = normalize_indian_phone(recipient_phone)
    if not normalized_phone:
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "verification_sid": None,
            "status": None,
            "error": (
                "Invalid recipient phone number format: "
                f"{recipient_phone}"
            ),
        }

    if not settings.TWILIO_SMS_ENABLED:
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "verification_sid": None,
            "status": None,
            "error": "SMS delivery is disabled in configuration",
        }

    cfg = _verify_settings()
    if not (cfg["account_sid"] and cfg["api_key"] and cfg["api_secret"]):
        logger.info(
            "Twilio Verify credentials not configured. Skipping verification "
            f"to {_mask_phone(normalized_phone)}.")
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "verification_sid": None,
            "status": None,
            "error": "Twilio SMS configuration is incomplete",
        }
    if not cfg["service_sid"]:
        logger.info(
            "Twilio Verify service not configured. Skipping verification "
            f"to {_mask_phone(normalized_phone)}.")
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "verification_sid": None,
            "status": None,
            "error": "Twilio Verify service is not configured",
        }

    try:
        from twilio.rest import Client
    except ImportError:
        logger.error("Twilio SDK not installed; cannot start verification.")
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "verification_sid": None,
            "status": None,
            "error": "SMS provider library not installed",
        }

    try:
        client = Client(
            cfg["api_key"],
            cfg["api_secret"],
            cfg["account_sid"],
        )
        verification = (
            client.verify.v2.services(cfg["service_sid"])
            .verifications.create(to=normalized_phone, channel="sms")
        )
        verification_sid = getattr(verification, "sid", None)
        verification_status = getattr(verification, "status", None)
        logger.info(
            "Twilio Verify started: to=%s verification_sid=%s status=%s",
            _mask_phone(normalized_phone),
            verification_sid,
            verification_status,
        )
        return {
            "success": True,
            "provider": VERIFY_PROVIDER,
            "verification_sid": str(verification_sid) if verification_sid else None,
            "status": str(verification_status) if verification_status else None,
            "error": None,
        }
    except Exception as exc:
        code = getattr(exc, "code", None)
        status = getattr(exc, "status", None)
        detail = ""
        if code:
            detail = f" (code={code})"
        elif status:
            detail = f" (status={status})"
        safe_message = _redact(str(exc) or "unknown provider error", cfg)
        if code == 21608:
            safe_message = f"{TRIAL_UNVERIFIED_MESSAGE} {safe_message}"
        logger.error(
            "Twilio Verify start failed: code=%s to=%s message=%s",
            code if code is not None else (status if status is not None else "?"),
            _mask_phone(normalized_phone),
            safe_message,
        )
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "verification_sid": None,
            "status": None,
            "error": f"Twilio verification failed{detail}: {safe_message}",
        }


def check_sms_verification(recipient_phone: str, code: str) -> dict[str, Any]:
    """Check a user-entered OTP against Twilio Verify.

    Returns: {"success": bool, "provider": "twilio-verify",
        "approved": bool, "expired": bool, "status": str | None,
        "error": str | None}
    ``approved`` is True only when Twilio reports ``approved``. The code
    itself is never logged or stored.
    """
    normalized_phone = normalize_indian_phone(recipient_phone)
    if not normalized_phone:
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": False,
            "status": None,
            "error": "Valid phone number is required",
        }
    if not code or not str(code).strip():
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": False,
            "status": None,
            "error": "Verification code is required",
        }

    if not settings.TWILIO_SMS_ENABLED:
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": False,
            "status": None,
            "error": "SMS delivery is disabled in configuration",
        }

    cfg = _verify_settings()
    if not (cfg["account_sid"] and cfg["api_key"] and cfg["api_secret"]):
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": False,
            "status": None,
            "error": "Twilio SMS configuration is incomplete",
        }
    if not cfg["service_sid"]:
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": False,
            "status": None,
            "error": "Twilio Verify service is not configured",
        }

    try:
        from twilio.rest import Client
    except ImportError:
        logger.error("Twilio SDK not installed; cannot check verification.")
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": False,
            "status": None,
            "error": "SMS provider library not installed",
        }

    try:
        client = Client(
            cfg["api_key"],
            cfg["api_secret"],
            cfg["account_sid"],
        )
        check = (
            client.verify.v2.services(cfg["service_sid"])
            .verification_checks.create(
                to=normalized_phone, code=str(code).strip()
            )
        )
        check_status = str(getattr(check, "status", "") or "").lower()
        if check_status == "approved":
            logger.info(
                "Twilio Verify approved: to=%s",
                _mask_phone(normalized_phone),
            )
            return {
                "success": True,
                "provider": VERIFY_PROVIDER,
                "approved": True,
                "expired": False,
                "status": check_status,
                "error": None,
            }
        expired = check_status in ("expired", "canceled", "cancelled")
        logger.info(
            "Twilio Verify not approved: to=%s status=%s",
            _mask_phone(normalized_phone),
            check_status or "pending",
        )
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": expired,
            "status": check_status or "pending",
            "error": (
                "Verification code has expired"
                if expired
                else "Invalid verification code"
            ),
        }
    except Exception as exc:
        code = getattr(exc, "code", None)
        safe_message = _redact(str(exc) or "unknown provider error", cfg)
        expired = "expir" in safe_message.lower()
        logger.error(
            "Twilio Verify check failed: code=%s to=%s message=%s",
            code if code is not None else "?",
            _mask_phone(normalized_phone),
            safe_message,
        )
        return {
            "success": False,
            "provider": VERIFY_PROVIDER,
            "approved": False,
            "expired": expired,
            "status": None,
            "error": (
                "Verification code has expired"
                if expired
                else "Invalid verification code"
            ),
        }
