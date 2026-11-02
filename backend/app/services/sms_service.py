import re

# =========================================================
# PHONE NORMALIZATION (SHARED BY TWILIO VERIFY OTP)
# =========================================================
# SMS in PolicyGPT is OTP-only via Twilio Verify
# (app/services/twilio_verify_service.py). Normal Twilio Messaging
# sends and notification SMS templates were retired; this module now
# exposes only phone-number normalization, which the Forgot Password
# SMS OTP path needs to build exact E.164 recipients.


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
