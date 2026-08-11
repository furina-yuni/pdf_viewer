import json
import os
from collections.abc import AsyncIterator
from functools import lru_cache
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
    RagDocumentStatusRequest,
    RagDocumentStatusResponse,
    RagPageBatch,
)
from .models_catalog import list_models
from .rag import RagService, RagUnavailableError
from .settings_store import public_settings, save_settings

app = FastAPI(title="Study PDF AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
        raise HTTPException(
            status_code=502,
            detail="모델 목록 서버에 연결하지 못했습니다.",
        ) from exc
    return ModelListResponse(models=models)


@lru_cache
def get_rag_service() -> RagService:
    return RagService()


@app.post("/api/rag/documents/status", response_model=RagDocumentStatusResponse)
async def rag_document_status(request: RagDocumentStatusRequest) -> RagDocumentStatusResponse:
    return get_rag_service().status(
        request.document_key,
        request.document_name,
        request.total_pages,
        get_settings(),
    )


@app.post(
    "/api/rag/documents/{document_key}/pages",
    response_model=RagDocumentStatusResponse,
)
async def rag_document_pages(
    document_key: str,
    batch: RagPageBatch,
) -> RagDocumentStatusResponse:
    try:
        return await get_rag_service().index_pages(document_key, batch, get_settings())
    except RagUnavailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            detail = (
                "임베딩 API 요청 한도에 도달했습니다. 지금까지의 색인은 저장되어 있습니다. "
                "잠시 후 재시도를 누르면 이어서 진행합니다."
            )
        elif exc.response.status_code in {401, 403}:
            detail = "임베딩 API 키와 해당 모델의 사용 권한을 확인해 주세요."
        elif exc.response.status_code == 404:
            detail = "임베딩 모델 이름과 API 기본 주소를 확인해 주세요."
        else:
            detail = "임베딩 API 설정 또는 사용량 제한을 확인해 주세요."
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=detail,
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="임베딩 API에 연결하지 못했습니다.") from exc


@app.post(
    "/api/rag/documents/{document_key}/finalize",
    response_model=RagDocumentStatusResponse,
)
async def rag_document_finalize(
    document_key: str,
    request: RagDocumentStatusRequest,
) -> RagDocumentStatusResponse:
    if request.document_key != document_key:
        raise HTTPException(status_code=400, detail="document key does not match")
    try:
        return get_rag_service().finalize(
            document_key,
            request.document_name,
            request.total_pages,
            get_settings(),
        )
    except RagUnavailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/api/rag/documents/{document_key}", status_code=204)
async def rag_document_delete(document_key: str) -> None:
    try:
        get_rag_service().delete(document_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def event(event_type: str, data: object) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    settings = get_settings()
    rag_chunks = []
    rag_state = "missing"
    if request.use_rag and request.document_key and settings.rag_enabled:
        try:
            nearby_page_numbers = {page.page_number for page in request.pages}
            rag_chunks = await get_rag_service().search(
                request.document_key,
                request.question,
                request.total_pages,
                settings,
                excluded_pages=nearby_page_numbers,
            )
            rag_state = "ready"
        except RagUnavailableError:
            rag_state = get_rag_service().status(
                request.document_key,
                request.document_key,
                request.total_pages,
                settings,
            ).state
        except Exception:
            rag_state = "error"
    context, nearby_pages, rag_pages = build_context(
        request,
        settings.max_context_chars,
        rag_chunks,
    )
    used_pages = sorted(set(nearby_pages + rag_pages))

    async def generate() -> AsyncIterator[str]:
        yield event(
            "message_start",
            {
                "pages": sorted(used_pages),
                "nearby_pages": sorted(nearby_pages),
                "rag_pages": sorted(rag_pages),
                "rag_state": rag_state,
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
            yield event(
                "message_end",
                {
                    "pages": sorted(used_pages),
                    "nearby_pages": sorted(nearby_pages),
                    "rag_pages": sorted(rag_pages),
                    "rag_state": rag_state,
                },
            )
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
