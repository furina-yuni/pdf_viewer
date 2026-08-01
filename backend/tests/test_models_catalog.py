from app.models_catalog import parse_gemini_models, parse_openai_models


def test_parse_openai_models_keeps_chat_capable_families():
    payload = {"data": [{"id": "gpt-4.1-mini"}, {"id": "text-embedding-3-small"}]}
    assert parse_openai_models(payload) == ["gpt-4.1-mini"]


def test_parse_gemini_models_keeps_generate_content_models():
    payload = {
        "models": [
            {"name": "models/gemini-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/embedding", "supportedGenerationMethods": ["embedContent"]},
        ]
    }
    assert parse_gemini_models(payload) == ["gemini-flash"]
