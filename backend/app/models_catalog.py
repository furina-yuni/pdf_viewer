import httpx


def parse_openai_models(payload: dict) -> list[str]:
    models = {
        item["id"]
        for item in payload.get("data", [])
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and item["id"].startswith(("gpt-", "o1", "o3", "o4", "chatgpt-"))
    }
    return sorted(models)


def parse_gemini_models(payload: dict) -> list[str]:
    models = set()
    for item in payload.get("models", []):
        if not isinstance(item, dict):
            continue
        methods = item.get("supportedGenerationMethods", [])
        name = item.get("name")
        if isinstance(name, str) and "generateContent" in methods:
            models.add(name.removeprefix("models/"))
    return sorted(models)


async def list_models(provider: str, base_url: str, api_key: str) -> list[str]:
    if not api_key:
        raise ValueError("API 키를 먼저 입력하거나 저장해 주세요.")

    async with httpx.AsyncClient(timeout=15) as client:
        if provider == "gemini":
            response = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                headers={"x-goog-api-key": api_key},
                params={"pageSize": 1000},
            )
            response.raise_for_status()
            return parse_gemini_models(response.json())

        response = await client.get(
            f"{base_url}/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        response.raise_for_status()
        return parse_openai_models(response.json())
