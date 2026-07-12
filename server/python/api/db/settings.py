import os
from typing import Optional
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    # App environment (development, staging, production, test)
    APP_ENV: str = Field(default="production", validation_alias="APP_ENV")

    # Database connections
    DATABASE_URL: SecretStr = Field(..., validation_alias="DATABASE_URL")
    DATABASE_POOL_SIZE: int = Field(default=5, validation_alias="DATABASE_POOL_SIZE")
    DATABASE_MAX_OVERFLOW: int = Field(default=10, validation_alias="DATABASE_MAX_OVERFLOW")

    # Auth configuration
    AUTH_PROVIDER: str = Field(default="firebase", validation_alias="AUTH_PROVIDER")
    FIREBASE_PROJECT_ID: Optional[str] = Field(default=None, validation_alias="FIREBASE_PROJECT_ID")

    # FastAPI settings
    CORS_ALLOWED_ORIGINS: str = Field(default="http://localhost:5173", validation_alias="CORS_ALLOWED_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_database_url_str(self) -> str:
        url = self.DATABASE_URL.get_secret_value()
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


# Instantiate settings globally
settings = DatabaseSettings()
