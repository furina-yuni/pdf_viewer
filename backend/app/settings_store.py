import os
from pathlib import Path

from .config import Settings, get_settings, resolved_embedding_model
from .models import LlmSettingsResponse, LlmSettingsUpdate

ENV_PATH = Path(
    os.environ.get(
        "STUDY_PDF_CONFIG_PATH",
        str(Path(__file__).resolve().parents[1] / ".env"),
    )
)


def public_settings(settings: Settings) -> LlmSettingsResponse:
    return LlmSettingsResponse(
        provider=settings.llm_provider,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        has_api_key=bool(settings.llm_api_key),
        rag_enabled=settings.rag_enabled,
        embedding_model=resolved_embedding_model(settings),
    )


def save_settings(update: LlmSettingsUpdate) -> LlmSettingsResponse:
    current = get_settings()
    api_key = "" if update.clear_api_key else (update.api_key or current.llm_api_key)
    values = {
        "LLM_PROVIDER": update.provider,
        "LLM_API_KEY": api_key,
        "LLM_MODEL": update.model.strip(),
        "LLM_BASE_URL": update.base_url,
        "LLM_EMBEDDING_MODEL": update.embedding_model.strip(),
        "RAG_ENABLED": str(update.rag_enabled).lower(),
        "MAX_CONTEXT_CHARS": str(current.max_context_chars),
    }
    content = "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = ENV_PATH.with_suffix(".env.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(ENV_PATH)
    get_settings.cache_clear()
    return public_settings(get_settings())
