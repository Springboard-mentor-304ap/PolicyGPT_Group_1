from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.database import Base

# =========================================================
# IMPORT ALL SQLALCHEMY MODELS
# =========================================================
# These imports register the models with Base.metadata.
# from app.models.user import User
# from app.models.otp import OTPVerification
# from app.models.password_reset import PasswordResetToken

# =========================================================
# ALEMBIC CONFIGURATION
# =========================================================

config = context.config


# =========================================================
# LOGGING
# =========================================================

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# =========================================================
# SQLALCHEMY METADATA
# =========================================================

target_metadata = Base.metadata


# =========================================================
# DATABASE URL
# =========================================================

database_url = settings.DATABASE_URL

config.set_main_option(
    "sqlalchemy.url",
    database_url.replace("%", "%%"),
)


# =========================================================
# OFFLINE MIGRATIONS
# =========================================================


def run_migrations_offline() -> None:
    """
    Run migrations in offline mode.
    """

    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={
            "paramstyle": "named",
        },
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# =========================================================
# ONLINE MIGRATIONS
# =========================================================


def run_migrations_online() -> None:
    """
    Run migrations using an active database connection.
    """

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


# =========================================================
# RUN MIGRATIONS
# =========================================================

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
