from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.models import RagPageBatch
from app.rag import (
    RagService,
    normalize_vector,
    retry_delay_seconds,
    rrf_fuse,
    split_page_text,
)


def rag_settings(model: str = "text-embedding-test") -> Settings:
    return Settings(
        llm_provider="openai",
        llm_api_key="test-key",
        llm_embedding_model=model,
        rag_enabled=True,
    )


def test_split_page_text_is_deterministic_and_overlaps() -> None:
    text = " ".join(f"word-{index}" for index in range(500))
    first = split_page_text("document-key", 4, text, chunk_size=180, overlap=25)
    second = split_page_text("document-key", 4, text, chunk_size=180, overlap=25)

    assert first == second
    assert len(first) > 2
    assert all(chunk["page_number"] == 4 for chunk in first)
    assert len({chunk["chunk_id"] for chunk in first}) == len(first)
    assert set(first[0]["text"].split()) & set(first[1]["text"].split())


def test_normalize_vector_and_rrf_fusion() -> None:
    assert normalize_vector([3.0, 4.0]) == pytest.approx([0.6, 0.8])
    vector = [
        {"chunk_id": "a", "page_number": 8, "text": "alpha"},
        {"chunk_id": "b", "page_number": 9, "text": "beta"},
    ]
    text = [
        {"chunk_id": "b", "page_number": 9, "text": "beta"},
        {"chunk_id": "c", "page_number": 10, "text": "alpha"},
    ]

    result = rrf_fuse(vector, text, excluded_pages={8}, limit=4)

    assert [(chunk.chunk_id, chunk.page_number) for chunk in result] == [("b", 9), ("c", 10)]


def test_retry_delay_uses_gemini_retry_info_and_safe_fallback() -> None:
    request = httpx.Request("POST", "https://example.test/embeddings")
    with_retry_info = httpx.Response(
        429,
        request=request,
        json={
            "error": {
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": "37s",
                    }
                ]
            }
        },
    )
    assert retry_delay_seconds(with_retry_info, 0) == 37.0

    fallback = httpx.Response(429, request=request)
    assert retry_delay_seconds(fallback, 0) == 15.0
    assert retry_delay_seconds(fallback, 3) == 120.0


@pytest.mark.asyncio
async def test_index_resumes_reuses_and_becomes_stale(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_embed(_settings: Settings, texts: list[str]) -> list[list[float]]:
        return [[float(len(text)), 1.0] for text in texts]

    monkeypatch.setattr("app.rag.embed_texts", fake_embed)
    service = RagService(tmp_path)
    settings = rag_settings()
    first = RagPageBatch.model_validate(
        {
            "document_name": "sample.pdf",
            "total_pages": 3,
            "pages": [
                {"page_number": 1, "text": "alpha page"},
                {"page_number": 2, "text": "beta page"},
            ],
        }
    )
    status = await service.index_pages("document-key", first, settings)
    assert status.processed_pages == [1, 2]

    duplicate_and_last = RagPageBatch.model_validate(
        {
            "document_name": "sample.pdf",
            "total_pages": 3,
            "pages": [
                {"page_number": 2, "text": "must not duplicate"},
                {"page_number": 3, "text": "gamma page"},
            ],
        }
    )
    status = await service.index_pages("document-key", duplicate_and_last, settings)
    assert status.processed_pages == [1, 2, 3]

    ready = service.finalize("document-key", "sample.pdf", 3, settings)
    assert ready.state == "ready"
    assert service.status("document-key", "sample.pdf", 3, settings).state == "ready"
    stale = service.status("document-key", "sample.pdf", 3, rag_settings("changed-model"))
    assert stale.state == "stale"
    assert stale.processed_pages == []

    import lancedb

    table = lancedb.connect(tmp_path / "document-key" / "active" / "lance").open_table("chunks")
    rows = table.to_arrow().to_pylist()
    assert len(rows) == 3
    assert [row["page_number"] for row in rows].count(2) == 1
    fts_rows = table.search("alpha", query_type="fts").limit(4).to_list()
    assert [row["page_number"] for row in fts_rows] == [1]

    result = await service.search(
        "document-key",
        "alpha",
        3,
        settings,
        excluded_pages={1},
    )
    assert len(result) <= 4
    assert all(chunk.page_number != 1 for chunk in result)
