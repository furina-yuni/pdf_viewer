import { FormEvent, useEffect, useState } from "react";
import { KeyRound, ListRestart, LoaderCircle, MessagesSquare, X } from "lucide-react";

type SettingsData = {
  provider: "mock" | "openai" | "gemini";
  model: string;
  base_url: string;
  has_api_key: boolean;
};

type Props = {
  open: boolean;
  historyQuestionLimit: number;
  onClose: () => void;
  onSaved: (message: string) => void;
  onHistoryQuestionLimit: (value: number) => void;
};

const defaults: SettingsData = {
  provider: "mock",
  model: "gpt-4.1-mini",
  base_url: "https://api.openai.com/v1",
  has_api_key: false,
};

export function SettingsModal({
  open,
  historyQuestionLimit,
  onClose,
  onSaved,
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
    fetch("/api/settings")
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
      });
    } else if (provider === "openai") {
      setSettings({
        ...settings,
        provider,
        model: "gpt-4.1-mini",
        base_url: "https://api.openai.com/v1",
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
      const response = await fetch("/api/models", {
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model,
          base_url: settings.base_url,
          api_key: apiKey || null,
          clear_api_key: clearKey,
        }),
      });
      if (!response.ok) throw new Error("설정을 저장하지 못했습니다.");
      const saved = (await response.json()) as SettingsData;
      setSettings(saved);
      setApiKey("");
      setClearKey(false);
      onHistoryQuestionLimit(historyLimitDraft);
      onSaved(saved.provider === "mock" ? "모의 AI 모드로 저장했습니다." : "AI API 설정을 저장했습니다.");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "설정 저장 오류");
    } finally {
      setLoading(false);
    }
  }

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
