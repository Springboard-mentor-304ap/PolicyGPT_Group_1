from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    SECRET_KEY: str

    ALGORITHM: str = "HS256"
    SMTP_EMAIL: str
    SMTP_APP_PASSWORD: str

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    DEBUG: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
