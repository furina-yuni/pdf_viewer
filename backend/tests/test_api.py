from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_rejects_page_outside_requested_window() -> None:
    response = client.post(
        "/api/chat/stream",
        json={
            "question": "test",
            "current_page": 5,
            "total_pages": 10,
            "page_range": {"before": 1, "after": 1},
            "pages": [
                {"page_number": 3, "text": "outside"},
                {"page_number": 5, "text": "current"},
            ],
        },
    )
    assert response.status_code == 422


def test_settings_never_returns_api_key() -> None:
    response = client.get("/api/settings")
    assert response.status_code == 200
    assert "api_key" not in response.json()
    assert "has_api_key" in response.json()


def test_gemini_settings_are_valid() -> None:
    from app.models import LlmSettingsUpdate

    settings = LlmSettingsUpdate(
        provider="gemini",
        model="gemini-3.6-flash",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )
    assert settings.provider == "gemini"
    assert settings.base_url.endswith("/openai")
