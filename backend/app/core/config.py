from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve backend/.env relative to this file so Uvicorn loads the same
# values regardless of the current working directory
# (e.g. `uvicorn app.main:app` from backend/ vs `--app-dir backend`
# from the repo root). Deployment environment variables still take
# precedence over the file; a missing file is fine in production.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_FILE = str(_BACKEND_DIR / ".env")


class Settings(BaseSettings):
    DATABASE_URL: str

    SECRET_KEY: str

    ALGORITHM: str = "HS256"
    SMTP_EMAIL: str = ""
    SMTP_APP_PASSWORD: str = ""
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "PolicyGPT"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587

    # =========================================================
    # BREVO CONFIGURATION (EMAIL ONLY — SMS IS OTP-ONLY VIA TWILIO VERIFY)
    # =========================================================
    BREVO_ENABLED: bool = True
    BREVO_API_KEY: str = ""
    BREVO_SMTP_HOST: str = "smtp-relay.brevo.com"
    BREVO_SMTP_PORT: int = 587
    BREVO_SMTP_USER: str = ""
    BREVO_SMTP_PASSWORD: str = ""
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = "PolicyGPT"
    BREVO_EMAIL_ENABLED: bool = True
    BREVO_SANDBOX_MODE: bool = False
    MAX_NOTIFICATION_RETRIES: int = 3

    # =========================================================
    # TWILIO CONFIGURATION (SMS OTP ONLY, VIA TWILIO VERIFY)
    # =========================================================
    # Read from backend/.env (or process env, which takes precedence).
    # The Verify service reads these via `settings` so values placed in
    # backend/.env are honoured; os.getenv() alone would NOT see them.
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_API_KEY: str = ""
    TWILIO_API_SECRET: str = ""
    TWILIO_SMS_ENABLED: bool = False
    # Twilio Verify Service SID (starts with VA...). Required for the
    # Forgot Password SMS OTP path, which uses Twilio Verify's
    # trial-approved OTP template. There is no other SMS sender: SMS is
    # OTP-only and Verify controls its own sender.
    TWILIO_VERIFY_SERVICE_SID: str = ""

    # Optional shared secret for the POST /webhooks/brevo/* callback endpoints.
    # Leave empty to keep them open (existing behaviour). Once set, Brevo must
    # be configured to send the value as the X-Brevo-Webhook-Secret header.
    BREVO_WEBHOOK_SECRET: str = ""

    # WebSocket / real-time notifications
    NOTIFICATIONS_REALTIME_ENABLED: bool = True
    # Fallback poll interval used by the Angular client when the socket cannot
    # be established. Deliberately coarse - the socket is the primary path.
    NOTIFICATIONS_FALLBACK_POLL_SECONDS: int = 60

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    DEBUG: bool = False

    # Password-reset abuse protection. Limits OTP / reset-link emails per
    # user per rolling window. Defaults preserve existing 5-min OTP and
    # 15-min reset-token lifetimes.
    PASSWORD_RESET_MAX_REQUESTS_PER_HOUR: int = 5
    OTP_EXPIRE_MINUTES: int = 5
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 15

    # Primary frontend URL used for user-facing backend-generated links
    # (emails, notifications). No trailing slash; normalized by validator.
    # Development default is the local Angular dev server. Production must
    # provide the real deployed frontend domain via env, e.g.
    # FRONTEND_URL=https://your-production-frontend-domain.com
    FRONTEND_URL: str = "http://localhost:4200"

    # Comma-separated frontend origins allowed to call the API (CORS,
    # export endpoints included). Development default covers the local
    # Angular dev server on localhost and 127.0.0.1. Set FRONTEND_ORIGINS
    # in production, e.g.
    # FRONTEND_ORIGINS=https://your-production-frontend-domain.com
    FRONTEND_ORIGINS: str = "http://localhost:4200,http://127.0.0.1:4200"

    # =========================================================
    # CHATBOT (PolicyGPT Assistant) CONFIGURATION
    # =========================================================
    # Master switch for the chatbot module (routes return 503 when off).
    CHATBOT_ENABLED: bool = True
    # Server-side guest usage cap (messages per guest user).
    CHATBOT_GUEST_MESSAGE_LIMIT: int = 5
    # Longest accepted user message (longer requests get HTTP 413).
    CHATBOT_MAX_MESSAGE_LENGTH: int = 2000
    # Conversation messages returned/stored per history request.
    CHATBOT_MAX_HISTORY: int = 20
    # Authenticated per-user throttle: max messages per rolling window.
    CHATBOT_RATE_LIMIT: int = 30
    CHATBOT_RATE_LIMIT_WINDOW_SECONDS: int = 60
    # Response provider: "template" (grounded, default) or "openai".
    CHATBOT_PROVIDER: str = "template"
    # Only read when CHATBOT_PROVIDER=openai. Never exposed to clients.
    CHATBOT_OPENAI_API_KEY: str = ""
    CHATBOT_OPENAI_MODEL: str = "gpt-4o-mini"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value: object) -> object:
        """Accept common deployment environment labels as debug flags."""
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"development", "dev", "debug"}:
                return True
            if normalized in {"production", "prod", "release"}:
                return False
        return value

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("FRONTEND_URL", mode="before")
    @classmethod
    def _normalize_frontend_url(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip().rstrip("/")
            return cleaned or "http://localhost:4200"
        return value

    @property
    def frontend_origins_list(self) -> list[str]:
        """Parse FRONTEND_ORIGINS into a clean list of origins.

        Supports multiple comma-separated origins, strips whitespace,
        drops empty entries, removes trailing slashes (so
        `https://app.example.com/` matches the browser origin
        `https://app.example.com`), and de-duplicates while
        preserving order.
        """
        raw = self.FRONTEND_ORIGINS or ""
        origins: list[str] = []
        for part in raw.split(","):
            candidate = part.strip().rstrip("/")
            if candidate and candidate not in origins:
                origins.append(candidate)
        return origins

    def model_post_init(self, __context: object) -> None:
        if not self.SMTP_EMAIL and self.SMTP_USERNAME:
            self.SMTP_EMAIL = self.SMTP_USERNAME
        if not self.SMTP_APP_PASSWORD and self.SMTP_PASSWORD:
            self.SMTP_APP_PASSWORD = self.SMTP_PASSWORD
        if not self.SMTP_FROM_EMAIL:
            self.SMTP_FROM_EMAIL = (
                self.SMTP_EMAIL or "noreply@policygpt.gov.in"
            )
        if not self.BREVO_SENDER_EMAIL and self.SMTP_FROM_EMAIL:
            self.BREVO_SENDER_EMAIL = self.SMTP_FROM_EMAIL
        if not self.BREVO_SENDER_NAME and self.SMTP_FROM_NAME:
            self.BREVO_SENDER_NAME = self.SMTP_FROM_NAME
        if not self.BREVO_SMTP_USER and (
            self.SMTP_USERNAME or self.SMTP_EMAIL
        ):
            self.BREVO_SMTP_USER = self.SMTP_USERNAME or self.SMTP_EMAIL
        if not self.BREVO_SMTP_PASSWORD and (
            self.SMTP_PASSWORD or self.SMTP_APP_PASSWORD
        ):
            self.BREVO_SMTP_PASSWORD = (
                self.SMTP_PASSWORD or self.SMTP_APP_PASSWORD
            )


settings = Settings()
