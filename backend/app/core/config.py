from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # BREVO CONFIGURATION
    # =========================================================
    BREVO_ENABLED: bool = True
    BREVO_API_KEY: str = ""
    BREVO_SMTP_HOST: str = "smtp-relay.brevo.com"
    BREVO_SMTP_PORT: int = 587
    BREVO_SMTP_USER: str = ""
    BREVO_SMTP_PASSWORD: str = ""
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = "PolicyGPT"
    BREVO_SMS_SENDER: str = "PolicyGPT"
    BREVO_EMAIL_ENABLED: bool = True
    BREVO_SMS_ENABLED: bool = True
    BREVO_SANDBOX_MODE: bool = False
    MAX_NOTIFICATION_RETRIES: int = 3

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

    # Comma-separated extra frontend origins allowed to call the API
    # (export endpoints included). Defaults cover local development;
    # set FRONTEND_ORIGINS in production, e.g.
    # FRONTEND_ORIGINS=https://app.example.com,https://admin.example.com
    FRONTEND_ORIGINS: str = ""

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
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

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
