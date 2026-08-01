import json
import os
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .context import build_context, system_prompt
from .llm import mock_stream, openai_stream
from .models import (
    ChatRequest,
    HealthResponse,
    LlmSettingsResponse,
    LlmSettingsUpdate,
    ModelListRequest,
    ModelListResponse,
)
from .models_catalog import list_models
from .settings_store import public_settings, save_settings

app = FastAPI(title="Study PDF AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", provider=settings.llm_provider)


@app.get("/api/settings", response_model=LlmSettingsResponse)
async def read_settings() -> LlmSettingsResponse:
    return public_settings(get_settings())


@app.put("/api/settings", response_model=LlmSettingsResponse)
async def update_settings(update: LlmSettingsUpdate) -> LlmSettingsResponse:
    return save_settings(update)


@app.post("/api/models", response_model=ModelListResponse)
async def read_models(request: ModelListRequest) -> ModelListResponse:
    settings = get_settings()
    api_key = request.api_key or settings.llm_api_key
    try:
        models = await list_models(request.provider, request.base_url, api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail="API 키 또는 공급자 설정을 확인해 주세요.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="모델 목록 서버에 연결하지 못했습니다.") from exc
    return ModelListResponse(models=models)


def event(event_type: str, data: object) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    settings = get_settings()
    context, used_pages = build_context(request, settings.max_context_chars)

    async def generate() -> AsyncIterator[str]:
        yield event(
            "message_start",
            {
                "pages": sorted(used_pages),
                "estimated_context_tokens": len(context) // 4,
            },
        )
        try:
            stream = (
                openai_stream(settings, request, context, system_prompt())
                if settings.llm_provider in {"openai", "gemini"}
                else mock_stream(request, used_pages)
            )
            async for content in stream:
                yield event("content_delta", {"content": content})
            yield event("message_end", {"pages": sorted(used_pages)})
        except Exception as exc:
            yield event("error", {"message": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


static_directory = os.environ.get("STUDY_PDF_STATIC_DIR")
if static_directory and Path(static_directory).is_dir():
    app.mount("/", StaticFiles(directory=static_directory, html=True), name="frontend")
