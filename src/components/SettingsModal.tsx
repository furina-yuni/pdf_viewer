import { FormEvent, useEffect, useState } from "react";
import { Database, KeyRound, ListRestart, LoaderCircle, MessagesSquare, X } from "lucide-react";
import { backendFetch } from "../lib/backend";
import type { RagStatus } from "../types";

type SettingsData = {
  provider: "mock" | "openai" | "gemini";
  model: string;
  base_url: string;
  has_api_key: boolean;
  rag_enabled: boolean;
  embedding_model: string;
};

type Props = {
  open: boolean;
  historyQuestionLimit: number;
  ragStatus: RagStatus | null;
  ragIndexing: boolean;
  totalPages: number;
  onClose: () => void;
  onSaved: (message: string) => void;
  onRagSettingsChanged: () => void;
  onStartRag: () => void;
  onReindexRag: () => void;
  onHistoryQuestionLimit: (value: number) => void;
};

const defaults: SettingsData = {
  provider: "mock",
  model: "gpt-4.1-mini",
  base_url: "https://api.openai.com/v1",
  has_api_key: false,
  rag_enabled: true,
  embedding_model: "text-embedding-3-small",
};

export function SettingsModal({
  open,
  historyQuestionLimit,
  ragStatus,
  ragIndexing,
  totalPages,
  onClose,
  onSaved,
  onRagSettingsChanged,
  onStartRag,
  onReindexRag,
  onHistoryQuestionLimit,
}: Props) {
  const [settings, setSettings] = useState(defaults);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [historyLimitDraft, setHistoryLimitDraft] = useState(historyQuestionLimit);

  useEffect(() => {
    if (!open) return;
    setHistoryLimitDraft(historyQuestionLimit);
    setLoading(true);
    setError("");
    backendFetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("설정을 불러오지 못했습니다.");
        return response.json() as Promise<SettingsData>;
      })
      .then((saved) => {
        setSettings(saved);
        if (saved.provider !== "mock" && saved.has_api_key) {
          void loadModels(saved, "");
        }
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [historyQuestionLimit, open]);

  if (!open) return null;

  function changeProvider(provider: SettingsData["provider"]) {
    setModels([]);
    if (provider === "gemini") {
      setSettings({
        ...settings,
        provider,
        model: "gemini-3.6-flash",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        embedding_model: "gemini-embedding-2",
      });
    } else if (provider === "openai") {
      setSettings({
        ...settings,
        provider,
        model: "gpt-4.1-mini",
        base_url: "https://api.openai.com/v1",
        embedding_model: "text-embedding-3-small",
      });
    } else {
      setSettings({ ...settings, provider });
    }
  }

  async function loadModels(current = settings, key = apiKey) {
    if (current.provider === "mock") return;
    setLoadingModels(true);
    setError("");
    try {
      const response = await backendFetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: current.provider,
          base_url: current.base_url,
          api_key: key || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "모델 목록을 불러오지 못했습니다.");
      }
      const available = payload.models as string[];
      setModels(available);
      if (!available.length) setError("사용 가능한 대화 모델을 찾지 못했습니다.");
    } catch (reason) {
      setModels([]);
      setError(reason instanceof Error ? reason.message : "모델 목록 조회 오류");
    } finally {
      setLoadingModels(false);
    }
  }

  async function saveSettings(closeAfterSave: boolean, startIndex: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = await backendFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model,
          base_url: settings.base_url,
          api_key: apiKey || null,
          clear_api_key: clearKey,
          rag_enabled: settings.rag_enabled,
          embedding_model: settings.embedding_model,
        }),
      });
      if (!response.ok) throw new Error("설정을 저장하지 못했습니다.");
      const saved = (await response.json()) as SettingsData;
      setSettings(saved);
      setApiKey("");
      setClearKey(false);
      onHistoryQuestionLimit(historyLimitDraft);
      onSaved(
        startIndex
          ? "AI API 설정을 저장하고 문서 색인을 시작했습니다."
          : saved.provider === "mock"
            ? "모의 AI 모드로 저장했습니다."
            : "AI API 설정을 저장했습니다.",
      );
      if (startIndex) {
        if (ragStatus?.state === "ready") onReindexRag();
        else onStartRag();
      } else {
        onRagSettingsChanged();
      }
      if (closeAfterSave) onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "설정 저장 오류");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveSettings(true, false);
  }

  const indexedPages = ragStatus?.indexed_pages ?? 0;
  const progressTotal = ragStatus?.total_pages || totalPages;
  const progressPercent = progressTotal > 0
    ? Math.min(100, Math.round((indexedPages / progressTotal) * 100))
    : 0;
  const canStartIndex = Boolean(
    totalPages
      && settings.rag_enabled
      && settings.provider !== "mock"
      && (settings.has_api_key || apiKey.trim()),
  );

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div className="settings-title">
            <span><KeyRound size={19} /></span>
            <div>
              <div className="eyebrow">LOCAL CONFIGURATION</div>
              <h2 id="settings-title">AI API 설정</h2>
            </div>
          </div>
          <button className="icon-button" aria-label="설정 닫기" onClick={onClose}><X size={17} /></button>
        </header>
        <form onSubmit={submit}>
          <label className="field">
            <span>연결 방식</span>
            <select
              value={settings.provider}
              onChange={(event) => changeProvider(event.target.value as SettingsData["provider"])}
            >
              <option value="mock">모의 응답 · API 키 불필요</option>
              <option value="openai">OpenAI API</option>
              <option value="gemini">Google Gemini API</option>
            </select>
          </label>
          <label className="field">
            <span className="model-field-title">
              모델
              {settings.provider !== "mock" && (
                <button type="button" className="load-models" onClick={() => void loadModels()}>
                  {loadingModels ? <LoaderCircle size={13} className="spin" /> : <ListRestart size={13} />}
                  모델 불러오기
                </button>
              )}
            </span>
            {models.length > 0 ? (
              <select
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              >
                {!models.includes(settings.model) && <option value={settings.model}>{settings.model}</option>}
                {models.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            ) : (
              <input
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              />
            )}
          </label>
          <label className="field">
            <span>API Base URL</span>
            <input value={settings.base_url} onChange={(event) => setSettings({ ...settings, base_url: event.target.value })} />
          </label>
          <label className="field">
            <span>API Key {settings.has_api_key && <em>저장됨</em>}</span>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder={settings.has_api_key ? "변경할 때만 새 키를 입력하세요" : "sk-..."}
              onChange={(event) => {
                setApiKey(event.target.value);
                setClearKey(false);
              }}
              onBlur={() => {
                if (apiKey.trim().length >= 8 && settings.provider !== "mock") {
                  void loadModels();
                }
              }}
            />
          </label>
          {settings.has_api_key && (
            <label className="clear-key">
              <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
              저장된 API 키 삭제
            </label>
          )}
          <div className="rag-settings-block">
            <label className="rag-toggle">
              <span><Database size={15} />문서 전체 검색</span>
              <input
                type="checkbox"
                checked={settings.rag_enabled}
                onChange={(event) => setSettings({ ...settings, rag_enabled: event.target.checked })}
              />
            </label>
            <label className="field">
              <span>임베딩 모델</span>
              <input
                value={settings.embedding_model}
                disabled={!settings.rag_enabled}
                onChange={(event) => setSettings({ ...settings, embedding_model: event.target.value })}
              />
              <small>색인 시 PDF 텍스트가 선택한 API 제공자에게 전송됩니다.</small>
            </label>
            <div className="rag-index-control">
              <div className="rag-index-summary">
                <span>현재 문서 색인</span>
                <strong>{progressTotal ? `${indexedPages}/${progressTotal}페이지 · ${progressPercent}%` : "PDF 없음"}</strong>
              </div>
              <div
                className="rag-progress-track"
                role="progressbar"
                aria-label="문서 색인 진행률"
                aria-valuemin={0}
                aria-valuemax={progressTotal || 1}
                aria-valuenow={indexedPages}
              >
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              {ragStatus?.error && <small className="rag-index-error">{ragStatus.error}</small>}
              <button
                type="button"
                className="rag-index-button"
                disabled={!canStartIndex || loading || ragIndexing}
                onClick={() => void saveSettings(false, true)}
              >
                {ragIndexing && <LoaderCircle size={14} className="spin" />}
                {ragIndexing
                  ? "색인 진행 중"
                  : ragStatus?.state === "ready"
                    ? "다시 색인"
                    : indexedPages > 0
                      ? "이어서 색인"
                      : "색인 시작"}
              </button>
              {!totalPages && <small>먼저 PDF를 열어 주세요.</small>}
            </div>
          </div>
          <label className="field history-limit-field">
            <span><MessagesSquare size={14} />대화 문맥</span>
            <input
              type="number"
              min={0}
              max={50}
              value={historyLimitDraft}
              onChange={(event) => {
                const value = Number(event.target.value);
                setHistoryLimitDraft(Number.isFinite(value) ? Math.min(50, Math.max(0, value)) : 10);
              }}
            />
            <small>AI가 참고할 최근 질문 수입니다. 0으로 설정하면 이전 대화를 보내지 않습니다.</small>
          </label>
          <p className="settings-note">
            공급자·모델·API 키는 이 컴퓨터의 백엔드 설정 파일에 저장되어 재실행 후에도 유지됩니다.
            API 키는 브라우저 저장소에 기록하지 않습니다.
          </p>
          {error && <p className="settings-error">{error}</p>}
          <footer>
            <button type="button" className="modal-cancel" onClick={onClose}>취소</button>
            <button type="submit" className="modal-save" disabled={loading}>
              {loading && <LoaderCircle size={15} className="spin" />}
              저장
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
