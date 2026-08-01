from app.context import build_context
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
    context, pages = build_context(make_request(), max_chars=10_000)
    assert pages == [5, 4, 6, 3, 7]
    assert context.index("[PAGE 5 - CURRENT]") < context.index("[PAGE 4]")


def test_context_respects_character_budget() -> None:
    context, pages = build_context(make_request(), max_chars=40)
    assert len(context) <= 40
    assert pages == [5]

