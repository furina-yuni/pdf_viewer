import asyncio
import hashlib
import json
import math
import os
import re
import shutil
from pathlib import Path
from typing import Any

import httpx

from .config import Settings, resolved_embedding_model
from .context import RetrievedChunk
from .models import RagDocumentStatusResponse, RagPageBatch

RAG_SCHEMA_VERSION = 1
CHUNK_SIZE = 1_800
CHUNK_OVERLAP = 250
EMBED_BATCH_SIZE = 16
EMBED_MAX_ATTEMPTS = 5
RRF_K = 60
DOCUMENT_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,200}$")


class RagUnavailableError(RuntimeError):
    pass


class EmbeddingShapeError(RuntimeError):
    pass


def retry_delay_seconds(response: httpx.Response, attempt: int) -> float:
    """Return the provider-requested delay, or a conservative 429 fallback."""
    candidates: list[float] = []
    retry_after = response.headers.get("retry-after", "").strip()
    try:
        candidates.append(float(retry_after))
    except ValueError:
        pass

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    details = payload.get("error", {}).get("details", []) if isinstance(payload, dict) else []
    if isinstance(details, list):
        for detail in details:
            if not isinstance(detail, dict):
                continue
            match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)s\s*", str(detail.get("retryDelay", "")))
            if match:
                candidates.append(float(match.group(1)))

    if candidates:
        return min(300.0, max(1.0, max(candidates)))
    return float(min(120, 15 * (2**attempt)))


def default_data_root() -> Path:
    configured = os.environ.get("STUDY_PDF_DATA_DIR")
    if configured:
        return Path(configured)
    local_app_data = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    return local_app_data / "study-pdf-ai-dev" / "rag"


def split_page_text(
    document_key: str,
    page_number: int,
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict[str, Any]]:
    normalized = " ".join(text.split())
    if not normalized or normalized.startswith("(이 페이지에서 텍스트를 추출하지 못했습니다.)"):
        return []
    if chunk_size <= overlap:
        raise ValueError("chunk_size must be greater than overlap")

    chunks: list[dict[str, Any]] = []
    start = 0
    chunk_index = 0
    while start < len(normalized):
        hard_end = min(len(normalized), start + chunk_size)
        end = hard_end
        if hard_end < len(normalized):
            boundary = normalized.rfind(" ", start + chunk_size // 2, hard_end)
            if boundary > start:
                end = boundary
        chunk_text = normalized[start:end].strip()
        if chunk_text:
            digest = hashlib.sha256(
                f"{document_key}:{page_number}:{chunk_index}:{chunk_text}".encode()
            ).hexdigest()[:32]
            chunks.append(
                {
                    "chunk_id": digest,
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "text": chunk_text,
                }
            )
            chunk_index += 1
        if end >= len(normalized):
            break
        start = max(start + 1, end - overlap)
    return chunks


def normalize_vector(vector: list[float]) -> list[float]:
    magnitude = math.sqrt(sum(value * value for value in vector))
    if not vector or magnitude == 0:
        raise EmbeddingShapeError("임베딩 API가 유효한 벡터를 반환하지 않았습니다.")
    return [float(value / magnitude) for value in vector]


def rrf_fuse(
    vector_rows: list[dict[str, Any]],
    text_rows: list[dict[str, Any]],
    excluded_pages: set[int] | None = None,
    limit: int = 4,
) -> list[RetrievedChunk]:
    excluded_pages = excluded_pages or set()
    scores: dict[str, float] = {}
    rows: dict[str, dict[str, Any]] = {}
    for ranked in (vector_rows, text_rows):
        for rank, row in enumerate(ranked, start=1):
            chunk_id = str(row["chunk_id"])
            rows[chunk_id] = row
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)

    result: list[RetrievedChunk] = []
    seen_text: set[str] = set()
    for chunk_id in sorted(scores, key=lambda item: (-scores[item], item)):
        row = rows[chunk_id]
        page_number = int(row["page_number"])
        text = str(row["text"]).strip()
        text_key = " ".join(text.lower().split())
        if page_number in excluded_pages or not text or text_key in seen_text:
            continue
        seen_text.add(text_key)
        result.append(RetrievedChunk(page_number=page_number, text=text, chunk_id=chunk_id))
        if len(result) >= limit:
            break
    return result


class RagService:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or default_data_root()

    def _document_root(self, document_key: str) -> Path:
        if not DOCUMENT_KEY_PATTERN.fullmatch(document_key):
            raise ValueError("invalid document key")
        return self.root / document_key

    @staticmethod
    def _read_manifest(directory: Path) -> dict[str, Any] | None:
        try:
            value = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else None
        except (OSError, ValueError):
            return None

    @staticmethod
    def _write_manifest(directory: Path, manifest: dict[str, Any]) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / "manifest.json"
        temporary = directory / "manifest.json.tmp"
        temporary.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(target)

    @staticmethod
    def _expected(settings: Settings, total_pages: int) -> dict[str, Any]:
        return {
            "schema_version": RAG_SCHEMA_VERSION,
            "provider": settings.llm_provider,
            "embedding_model": resolved_embedding_model(settings),
            "total_pages": total_pages,
        }

    @staticmethod
    def _matches(manifest: dict[str, Any] | None, expected: dict[str, Any]) -> bool:
        return bool(manifest) and all(manifest.get(key) == value for key, value in expected.items())

    def status(
        self,
        document_key: str,
        document_name: str,
        total_pages: int,
        settings: Settings,
    ) -> RagDocumentStatusResponse:
        expected = self._expected(settings, total_pages)
        document_root = self._document_root(document_key)
        active = self._read_manifest(document_root / "active")
        building = self._read_manifest(document_root / "building")

        if not settings.rag_enabled:
            state = "missing"
            manifest = active or building or {}
        elif settings.llm_provider == "mock" or not settings.llm_api_key:
            state = "needs_api_key"
            manifest = active or building or {}
        elif self._matches(active, expected) and active.get("state") == "ready":
            state = "ready"
            manifest = active
        elif self._matches(building, expected):
            state = building.get("state", "indexing")
            if state not in {"indexing", "error"}:
                state = "indexing"
            manifest = building
        elif active or building:
            state = "stale"
            manifest = {}
        else:
            state = "missing"
            manifest = {}

        return RagDocumentStatusResponse(
            state=state,
            indexed_pages=len(manifest.get("processed_pages", [])),
            processed_pages=sorted(int(page) for page in manifest.get("processed_pages", [])),
            total_pages=total_pages,
            provider=settings.llm_provider,
            embedding_model=resolved_embedding_model(settings),
            rag_enabled=settings.rag_enabled,
            error=manifest.get("error"),
        )

    def _prepare_build(
        self,
        document_key: str,
        batch: RagPageBatch,
        settings: Settings,
    ) -> tuple[Path, dict[str, Any]]:
        document_root = self._document_root(document_key)
        building = document_root / "building"
        expected = self._expected(settings, batch.total_pages)
        manifest = self._read_manifest(building)
        if not self._matches(manifest, expected):
            if building.exists():
                shutil.rmtree(building)
            manifest = {
                **expected,
                "state": "indexing",
                "document_name": batch.document_name,
                "processed_pages": [],
                "vector_dimension": None,
                "error": None,
            }
            self._write_manifest(building, manifest)
        return building, manifest

    async def index_pages(
        self,
        document_key: str,
        batch: RagPageBatch,
        settings: Settings,
    ) -> RagDocumentStatusResponse:
        if not settings.rag_enabled:
            raise RagUnavailableError("문서 전체 검색이 비활성화되어 있습니다.")
        if settings.llm_provider == "mock" or not settings.llm_api_key:
            raise RagUnavailableError("문서 색인을 시작하려면 API 키가 필요합니다.")

        building, manifest = self._prepare_build(document_key, batch, settings)
        processed = {int(page) for page in manifest.get("processed_pages", [])}
        new_pages = [page for page in batch.pages if page.page_number not in processed]
        chunks = [
            chunk
            for page in new_pages
            for chunk in split_page_text(document_key, page.page_number, page.text)
        ]
        try:
            if chunks:
                vectors = await embed_texts(settings, [str(chunk["text"]) for chunk in chunks])
                if len(vectors) != len(chunks):
                    raise EmbeddingShapeError("임베딩 결과 개수가 색인 조각 수와 다릅니다.")
                dimension = len(vectors[0])
                previous_dimension = manifest.get("vector_dimension")
                if previous_dimension not in {None, dimension}:
                    raise EmbeddingShapeError("기존 색인과 임베딩 차원이 다릅니다.")
                records = [
                    {**chunk, "vector": vector}
                    for chunk, vector in zip(chunks, vectors, strict=True)
                ]
                self._append_records(building / "lance", records)
                manifest["vector_dimension"] = dimension

            processed.update(page.page_number for page in new_pages)
            manifest.update(
                state="indexing",
                processed_pages=sorted(processed),
                error=None,
            )
            self._write_manifest(building, manifest)
        except Exception as exc:
            manifest.update(state="error", error=str(exc))
            self._write_manifest(building, manifest)
            raise

        return self.status(
            document_key,
            batch.document_name,
            batch.total_pages,
            settings,
        )

    @staticmethod
    def _append_records(database_path: Path, records: list[dict[str, Any]]) -> None:
        import lancedb

        database_path.mkdir(parents=True, exist_ok=True)
        database = lancedb.connect(database_path)
        if "chunks" in database.list_tables().tables:
            database.open_table("chunks").add(records)
        else:
            database.create_table("chunks", data=records)

    def finalize(
        self,
        document_key: str,
        document_name: str,
        total_pages: int,
        settings: Settings,
    ) -> RagDocumentStatusResponse:
        import lancedb

        document_root = self._document_root(document_key)
        building = document_root / "building"
        manifest = self._read_manifest(building)
        expected = self._expected(settings, total_pages)
        if not self._matches(manifest, expected):
            raise RagUnavailableError("완료할 수 있는 현재 색인이 없습니다.")
        processed = {int(page) for page in manifest.get("processed_pages", [])}
        missing = set(range(1, total_pages + 1)) - processed
        if missing:
            raise RagUnavailableError(f"아직 {len(missing)}페이지가 색인되지 않았습니다.")
        database_path = building / "lance"
        if not database_path.exists():
            manifest.update(state="error", error="검색 가능한 PDF 텍스트가 없습니다.")
            self._write_manifest(building, manifest)
            raise RagUnavailableError("검색 가능한 PDF 텍스트가 없습니다.")

        database = lancedb.connect(database_path)
        table = database.open_table("chunks")
        from lancedb.index import FTS

        table.create_index("text", config=FTS(), replace=True)
        manifest.update(state="ready", error=None)
        self._write_manifest(building, manifest)
        del table
        del database

        active = document_root / "active"
        backup = document_root / "active.old"
        if backup.exists():
            shutil.rmtree(backup)
        if active.exists():
            active.replace(backup)
        try:
            building.replace(active)
        except Exception:
            if backup.exists() and not active.exists():
                backup.replace(active)
            raise
        if backup.exists():
            shutil.rmtree(backup)
        return self.status(document_key, document_name, total_pages, settings)

    def delete(self, document_key: str) -> None:
        document_root = self._document_root(document_key)
        if document_root.exists():
            shutil.rmtree(document_root)

    async def search(
        self,
        document_key: str,
        question: str,
        total_pages: int,
        settings: Settings,
        excluded_pages: set[int] | None = None,
        limit: int = 4,
    ) -> list[RetrievedChunk]:
        import lancedb

        status = self.status(document_key, document_key, total_pages, settings)
        if status.state != "ready":
            raise RagUnavailableError(f"문서 검색 색인이 준비되지 않았습니다: {status.state}")
        vector = (await embed_texts(settings, [question]))[0]
        database = lancedb.connect(self._document_root(document_key) / "active" / "lance")
        table = database.open_table("chunks")
        vector_rows = table.search(vector, vector_column_name="vector").limit(12).to_list()
        try:
            text_rows = table.search(question, query_type="fts").limit(12).to_list()
        except Exception:
            text_rows = []
        return rrf_fuse(vector_rows, text_rows, excluded_pages=excluded_pages, limit=limit)


async def _request_embeddings(settings: Settings, texts: list[str]) -> list[list[float]]:
    endpoint = f"{settings.llm_base_url.rstrip('/')}/embeddings"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": resolved_embedding_model(settings), "input": texts}
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(EMBED_MAX_ATTEMPTS):
            response = await client.post(endpoint, headers=headers, json=payload)
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < EMBED_MAX_ATTEMPTS - 1:
                    delay = (
                        retry_delay_seconds(response, attempt)
                        if response.status_code == 429
                        else min(8.0, 1.0 * (2**attempt))
                    )
                    await asyncio.sleep(delay)
                    continue
            response.raise_for_status()
            data = response.json().get("data", [])
            ordered = sorted(data, key=lambda item: int(item.get("index", 0)))
            vectors = [normalize_vector(item.get("embedding", [])) for item in ordered]
            if len(vectors) != len(texts):
                raise EmbeddingShapeError("임베딩 API 응답 개수가 요청과 다릅니다.")
            return vectors
    raise RuntimeError("임베딩 API 요청에 실패했습니다.")


async def embed_texts(settings: Settings, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if not settings.llm_api_key:
        raise RagUnavailableError("임베딩 API 키가 설정되지 않았습니다.")

    result: list[list[float]] = []
    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start : start + EMBED_BATCH_SIZE]
        try:
            result.extend(await _request_embeddings(settings, batch))
        except EmbeddingShapeError:
            for text in batch:
                result.extend(await _request_embeddings(settings, [text]))
    return result
