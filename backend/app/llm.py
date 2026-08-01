import asyncio
import json
from collections.abc import AsyncIterator

import httpx

from .config import Settings
from .models import ChatRequest


async def mock_stream(request: ChatRequest, used_pages: list[int]) -> AsyncIterator[str]:
    pages = ", ".join(str(page) for page in sorted(used_pages))
    answer = (
        f"개발용 모의 응답입니다. 현재 질문은 **{request.current_page}페이지**를 중심으로 "
        f"{pages}페이지의 텍스트만 참고하도록 구성되었습니다.\n\n"
        f"질문: {request.question}\n\n"
        "실제 AI 답변을 사용하려면 상단의 `API 설정`에서 OpenAI 또는 "
        "Google Gemini 연결과 API 키를 설정하세요."
    )
    for index in range(0, len(answer), 14):
        yield answer[index : index + 14]
        await asyncio.sleep(0.02)


async def openai_stream(
    settings: Settings,
    request: ChatRequest,
    context: str,
    system: str,
) -> AsyncIterator[str]:
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is required when LLM_PROVIDER=openai")

    history = [
        {"role": item.role, "content": item.content}
        for item in request.history[-8:]
        if item.role in {"user", "assistant"}
    ]
    payload = {
        "model": settings.llm_model,
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            *history,
            {
                "role": "user",
                "content": f"PDF CONTEXT:\n{context}\n\nQUESTION:\n{request.question}",
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    endpoint = f"{settings.llm_base_url.rstrip('/')}/chat/completions"

    async with httpx.AsyncClient(timeout=90) as client:
        async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                chunk = json.loads(data)
                content = chunk["choices"][0]["delta"].get("content")
                if content:
                    yield content
