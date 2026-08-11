import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Database, Eraser, Quote, RefreshCw, Send, Square, Trash2, UserRound, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { ChatMessage, RagStatus } from "../types";

type Props = {
  messages: ChatMessage[];
  totalPages: number;
  selectedTexts: { id: string; text: string }[];
  busy: boolean;
  question: string;
  ragStatus: RagStatus | null;
  ragIndexing: boolean;
  onQuestion: (value: string) => void;
  onRemoveSelection: (id: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onClear: () => void;
  onPageClick: (page: number) => void;
  onRetryRag: () => void;
  onReindexRag: () => void;
  onDeleteRag: () => void;
};

function ragStatusText(status: RagStatus | null, totalPages: number, indexing: boolean): string {
  if (!totalPages) return "PDF를 열면 문서 전체 검색을 준비합니다";
  if (!status) return "문서 검색 확인 중";
  if (!status.rag_enabled) return "문서 전체 검색 꺼짐";
  if (status.state === "ready") {
    return status.loadedFromCache ? "저장된 색인 불러옴" : "문서 검색 준비됨";
  }
  if (status.state === "indexing") {
    return indexing
      ? `색인 중 ${status.indexed_pages}/${status.total_pages}`
      : `색인 대기 ${status.indexed_pages}/${status.total_pages} · API 설정에서 시작`;
  }
  if (status.state === "needs_api_key") return "API 설정 필요";
  if (status.state === "stale") return "설정 변경 감지 · 다시 색인 중";
  if (status.state === "error") {
    const progress = status.indexed_pages > 0
      ? ` · ${status.indexed_pages}/${status.total_pages} 저장됨`
      : "";
    return `색인 오류${progress} · 재시도`;
  }
  return "문서 검색 준비 중";
}

export function ChatSidebar(props: Props) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const userScrolledAway = useRef(false);
  const previousMessageCount = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const hasNewMessage = props.messages.length > previousMessageCount.current;
    previousMessageCount.current = props.messages.length;

    if (hasNewMessage) userScrolledAway.current = false;
    if (userScrolledAway.current) return;

    const frame = window.requestAnimationFrame(() => {
      const messages = messagesRef.current;
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.messages]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(24, Math.min(input.scrollHeight, 160))}px`;
  }, [props.question]);

  function submit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit();
  }

  async function copyAnswer(message: ChatMessage) {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message.content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((current) => current === message.id ? null : current);
    }, 1_500);
  }

  return (
    <aside className="chat-sidebar">
      <div className={`rag-status rag-${props.ragStatus?.state ?? "checking"}`}>
        <Database size={14} />
        <span title={props.ragStatus?.error ?? undefined}>
          {ragStatusText(props.ragStatus, props.totalPages, props.ragIndexing)}
        </span>
        {props.ragStatus?.state === "error" && (
          <button type="button" onClick={props.onRetryRag} title="색인 재시도">
            <RefreshCw size={13} />
          </button>
        )}
        {props.ragStatus?.state === "ready" && (
          <>
            <button type="button" onClick={props.onReindexRag} title="다시 색인">
              <RefreshCw size={13} />
            </button>
            <button type="button" onClick={props.onDeleteRag} title="색인 삭제">
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
      <div className="chat-actions">
        <button className="icon-button" title="대화 지우기" onClick={props.onClear}>
          <Eraser size={17} />
        </button>
      </div>

      <div
        className="messages"
        ref={messagesRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
          userScrolledAway.current = distanceFromBottom > 72;
        }}
      >
        {props.messages.length === 0 ? (
          <div className="chat-empty">
            <Bot size={26} />
            <strong>문서에 관해 질문해 보세요</strong>
            <span>“이 페이지의 핵심 개념을 예시와 함께 설명해줘”</span>
          </div>
        ) : (
          props.messages.map((message) => (
            <article key={message.id} className={`message ${message.role} ${message.error ? "error" : ""}`}>
              <div className="avatar">
                {message.role === "assistant" ? <Bot size={15} /> : <UserRound size={15} />}
              </div>
              <div className="message-body">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {message.content || "…"}
                </ReactMarkdown>
                {message.role === "assistant" && message.content && (
                  <div className="message-tools">
                    <button
                      type="button"
                      onClick={() => void copyAnswer(message)}
                      aria-label="답변 전체 복사"
                      title="답변 전체 복사"
                    >
                      {copiedMessageId === message.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedMessageId === message.id ? "복사됨" : "복사"}
                    </button>
                  </div>
                )}
                {message.pages && message.pages.length > 0 && (
                  <div className="message-meta">
                    참고 페이지
                    {message.pages.map((page) => (
                      <button key={page} onClick={() => props.onPageClick(page)}>p.{page}</button>
                    ))}
                    {message.tokenEstimate != null && <span>약 {message.tokenEstimate} tokens</span>}
                    {message.ragPages && message.ragPages.length > 0 && (
                      <span>문서 검색 {message.ragPages.map((page) => `p.${page}`).join(", ")}</span>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <div className="composer-card">
          {props.selectedTexts.length > 0 && (
            <div className="selection-attachments" aria-label="첨부한 인용문">
              {props.selectedTexts.map((selection, index) => (
                <div className="selection-attachment" key={selection.id}>
                  <div className="selection-attachment-icon">
                    <Quote size={14} />
                    <span>{index + 1}</span>
                  </div>
                  <p>{selection.text}</p>
                  <button
                    type="button"
                    aria-label={`인용 ${index + 1} 제거`}
                    onClick={() => props.onRemoveSelection(selection.id)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-input-row">
            <textarea
              ref={inputRef}
              aria-label="질문"
              rows={1}
              value={props.question}
              disabled={!props.totalPages}
              placeholder={props.totalPages ? "PDF에 관해 질문하세요" : "먼저 PDF를 열어주세요"}
              onChange={(event) => props.onQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  props.onSubmit();
                }
              }}
            />
            {props.busy ? (
              <button type="button" className="send-button stop" aria-label="답변 중지" onClick={props.onStop}>
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                aria-label="질문 전송"
                disabled={!props.question.trim() || !props.totalPages}
              >
                <Send size={17} />
              </button>
            )}
          </div>
        </div>
      </form>
    </aside>
  );
}
