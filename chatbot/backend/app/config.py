import logging
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("config")

# Values that must never reach production. If .env is missing or a key is left
# empty, pydantic would otherwise silently fall back to these and the service
# would run with a forgeable JWT secret and a publicly known admin password.
_INSECURE_DEFAULTS = {"dev-secret-change-me", "admin1234", "change-me", ""}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg2://chatbot:chatbot@db:5432/chatbot"
    REDIS_URL: str = "redis://redis:6379/0"

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""

    JWT_SECRET: str = ""
    ADMIN_PASSWORD: str = ""
    DEBUG: bool = False          # جزئیات خطا فقط در حالت توسعه

    KAVENEGAR_API_KEY: str = ""
    KAVENEGAR_TEMPLATE: str = "otp-verify"

    UPLOAD_DIR: str = "/data/uploads"
    MAX_UPLOAD_MB: int = 200


settings = Settings()


def _check_secrets() -> None:
    """Refuse to start with a missing/known-default secret.

    JWT_SECRET must match the main app's so SSO works; a weak or empty value
    means anyone can mint valid user *and* admin tokens for both services.
    """
    problems = []
    if settings.JWT_SECRET.strip() in _INSECURE_DEFAULTS or len(settings.JWT_SECRET) < 32:
        problems.append(
            "JWT_SECRET تنظیم نشده یا کوتاه است (حداقل ۳۲ نویسه) — "
            "باید دقیقاً همان JWT_SECRET اپ اصلی باشد."
        )
    if settings.ADMIN_PASSWORD.strip() in _INSECURE_DEFAULTS or len(settings.ADMIN_PASSWORD) < 8:
        problems.append("ADMIN_PASSWORD تنظیم نشده یا کوتاه‌تر از ۸ نویسه است.")

    if not problems:
        return

    if settings.DEBUG:
        # حالت توسعه: اجازه بده بالا بیاید ولی با کلید تصادفی و هشدار پررنگ
        for p in problems:
            log.warning("⚠️  %s", p)
        if settings.JWT_SECRET.strip() in _INSECURE_DEFAULTS or len(settings.JWT_SECRET) < 32:
            settings.JWT_SECRET = secrets.token_hex(32)
            log.warning("⚠️  یک JWT_SECRET موقت ساخته شد — SSO با اپ اصلی کار نخواهد کرد.")
        if settings.ADMIN_PASSWORD.strip() in _INSECURE_DEFAULTS or len(settings.ADMIN_PASSWORD) < 8:
            settings.ADMIN_PASSWORD = secrets.token_urlsafe(18)
            log.warning("⚠️  رمز ادمین موقت: %s", settings.ADMIN_PASSWORD)
        return

    raise RuntimeError(
        "پیکربندی امن نیست، سرویس بالا نمی‌آید:\n  - " + "\n  - ".join(problems)
        + "\nمقادیر را در chatbot/.env تنظیم کنید (نمونه: chatbot/.env.example)."
    )


_check_secrets()
