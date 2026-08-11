from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class PageContext(BaseModel):
    page_number: int = Field(ge=1)
    text: str = Field(max_length=100_000)


class PageRange(BaseModel):
    before: int = Field(default=1, ge=0, le=10)
    after: int = Field(default=1, ge=0, le=10)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=8_000)
    current_page: int = Field(ge=1)
    total_pages: int = Field(ge=1)
    page_range: PageRange
    pages: list[PageContext] = Field(min_length=1, max_length=21)
    selected_text: str | None = Field(default=None, max_length=20_000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=100)
    document_key: str | None = Field(default=None, pattern=r"^[A-Za-z0-9._-]{8,200}$")
    use_rag: bool = True

    @model_validator(mode="after")
    def validate_page_window(self) -> "ChatRequest":
        expected_start = max(1, self.current_page - self.page_range.before)
        expected_end = min(self.total_pages, self.current_page + self.page_range.after)
        page_numbers = [page.page_number for page in self.pages]

        if self.current_page > self.total_pages:
            raise ValueError("current_page cannot exceed total_pages")
        if len(page_numbers) != len(set(page_numbers)):
            raise ValueError("duplicate page numbers are not allowed")
        if self.current_page not in page_numbers:
            raise ValueError("the current page must be included")
        if any(page < expected_start or page > expected_end for page in page_numbers):
            raise ValueError("a page is outside the requested context range")
        return self


class HealthResponse(BaseModel):
    status: str
    provider: str


class LlmSettingsResponse(BaseModel):
    provider: Literal["mock", "openai", "gemini"]
    model: str
    base_url: str
    has_api_key: bool
    rag_enabled: bool
    embedding_model: str


class LlmSettingsUpdate(BaseModel):
    provider: Literal["mock", "openai", "gemini"]
    model: str = Field(min_length=1, max_length=200)
    base_url: str = Field(min_length=8, max_length=500)
    api_key: str | None = Field(default=None, max_length=1_000)
    clear_api_key: bool = False
    rag_enabled: bool = True
    embedding_model: str = Field(default="", max_length=200)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return value

    @field_validator("api_key")
    @classmethod
    def reject_multiline_key(cls, value: str | None) -> str | None:
        if value is not None and ("\n" in value or "\r" in value):
            raise ValueError("api_key cannot contain line breaks")
        return value


class ModelListRequest(BaseModel):
    provider: Literal["openai", "gemini"]
    base_url: str = Field(min_length=8, max_length=500)
    api_key: str | None = Field(default=None, max_length=1_000)

    @field_validator("base_url")
    @classmethod
    def validate_model_base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return value


class ModelListResponse(BaseModel):
    models: list[str]


DocumentKey = str
RagState = Literal["missing", "indexing", "ready", "stale", "needs_api_key", "error"]


class RagDocumentStatusRequest(BaseModel):
    document_key: DocumentKey = Field(pattern=r"^[A-Za-z0-9._-]{8,200}$")
    document_name: str = Field(min_length=1, max_length=500)
    total_pages: int = Field(ge=1, le=100_000)


class RagDocumentStatusResponse(BaseModel):
    state: RagState
    indexed_pages: int = Field(ge=0)
    processed_pages: list[int] = Field(default_factory=list)
    total_pages: int = Field(ge=1)
    provider: str
    embedding_model: str
    rag_enabled: bool
    error: str | None = None


class RagPageBatch(BaseModel):
    document_name: str = Field(min_length=1, max_length=500)
    total_pages: int = Field(ge=1, le=100_000)
    pages: list[PageContext] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_pages(self) -> "RagPageBatch":
        numbers = [page.page_number for page in self.pages]
        if len(numbers) != len(set(numbers)):
            raise ValueError("duplicate page numbers are not allowed")
        if any(page > self.total_pages for page in numbers):
            raise ValueError("a page exceeds total_pages")
        return self
