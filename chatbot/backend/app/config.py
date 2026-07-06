from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg2://chatbot:chatbot@db:5432/chatbot"
    REDIS_URL: str = "redis://redis:6379/0"

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""

    JWT_SECRET: str = "dev-secret-change-me"
    ADMIN_PASSWORD: str = "admin1234"
    DEBUG: bool = True

    KAVENEGAR_API_KEY: str = ""
    KAVENEGAR_TEMPLATE: str = "otp-verify"

    UPLOAD_DIR: str = "/data/uploads"
    MAX_UPLOAD_MB: int = 200


settings = Settings()
