from app.context import RetrievedChunk, build_context
from app.models import ChatRequest


def make_request() -> ChatRequest:
    return ChatRequest.model_validate(
        {
            "question": "핵심을 설명해줘",
            "current_page": 5,
            "total_pages": 10,
            "page_range": {"before": 2, "after": 2},
            "pages": [
                {"page_number": page, "text": f"page {page} text"}
                for page in range(3, 8)
            ],
        }
    )


def test_context_prioritizes_current_and_nearby_pages() -> None:
    context, pages, rag_pages = build_context(make_request(), max_chars=10_000)
    assert pages == [5, 4, 6, 3, 7]
    assert rag_pages == []
    assert context.index("[PAGE 5 - CURRENT]") < context.index("[PAGE 4]")


def test_context_respects_character_budget() -> None:
    context, pages, rag_pages = build_context(make_request(), max_chars=40)
    assert len(context) <= 40
    assert pages == [5]
    assert rag_pages == []


def test_context_adds_rag_after_nearby_pages() -> None:
    chunks = [RetrievedChunk(page_number=9, text="distant evidence", chunk_id="chunk-9")]
    context, pages, rag_pages = build_context(
        make_request(),
        max_chars=10_000,
        rag_chunks=chunks,
    )

    assert pages == [5, 4, 6, 3, 7]
    assert rag_pages == [9]
    assert context.index("[PAGE 7]") < context.index("[RAG PAGE 9]")
