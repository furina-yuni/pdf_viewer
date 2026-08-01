import os
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("backend/.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_provider: Literal["mock", "openai", "gemini"] = "mock"
    llm_api_key: str = ""
    llm_model: str = "gpt-4.1-mini"
    llm_base_url: str = "https://api.openai.com/v1"
    max_context_chars: int = 60_000


@lru_cache
def get_settings() -> Settings:
    config_path = os.environ.get("STUDY_PDF_CONFIG_PATH")
    return Settings(_env_file=config_path) if config_path else Settings()
