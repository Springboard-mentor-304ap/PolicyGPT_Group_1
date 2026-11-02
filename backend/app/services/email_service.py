import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def send_otp_email(
    recipient_email: str,
    otp: str
):
    message = MIMEMultipart()

    message["From"] = settings.SMTP_EMAIL
    message["To"] = recipient_email
    message["Subject"] = "PolicyGPT Verification OTP"

    body = f"""
Hello,

Your PolicyGPT verification OTP is:

{otp}

This OTP is valid for 5 minutes.

If you did not request this OTP, please ignore this email.

Regards,
PolicyGPT Team
"""

    message.attach(
        MIMEText(body, "plain")
    )

    try:

        with smtplib.SMTP(
            "smtp.gmail.com",
            587
        ) as server:

            server.starttls()

            server.login(
                settings.SMTP_EMAIL,
                settings.SMTP_APP_PASSWORD
            )

            server.send_message(message)

    except Exception as exc:

        print("EMAIL ERROR:", exc)

        raise