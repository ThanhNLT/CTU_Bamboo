// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App } from "antd";
import { Bot, History, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { primaryButtonClass, secondaryButtonClass } from "../../components/ui";
import { cn } from "../../utils/cn";
import { copyText } from "../../utils/clipboard";
import { ask, fetchAssistants, fetchDocument, fetchHistory, isPending, plainText, watchQuestion } from "./assistant";
import { AiMessage } from "./components/AiMessage";
import { ChatArea } from "./components/ChatArea";
import { ChatInput } from "./components/ChatInput";
import { ChatSidebar } from "./components/ChatSidebar";
import { UserMessage } from "./components/UserMessage";
import type { Assistant, Question } from "./types";

type Status = { loading: boolean; enabled: boolean; assistants: Assistant[] };

const AiOff = ({ loading }: { loading: boolean }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white px-6 py-16 text-center shadow-card">
    <span className="grid h-11 w-11 place-items-center rounded-full bg-black/[0.045] text-muted" aria-hidden>
      <Bot className="h-5 w-5" />
    </span>
    {loading ? (
      <p className="text-[13px] text-muted">Đang khởi động trợ lý AI, lần đầu sau khi nghỉ có thể mất vài giây…</p>
    ) : (
      <>
        <p className="text-[15px] font-semibold text-ink">Trợ lý AI chưa bật</p>
        <p className="max-w-md text-[12.5px] text-muted">
          Máy chủ chưa chạy mô hình AI cục bộ, hoặc chưa có trợ lý nào được cấu hình cho đơn vị của bạn. Liên hệ người
          quản trị tác tử AI.
        </p>
      </>
    )}
  </div>
);

export const AiAssistantPage = () => {
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const docId = params.get("doc") ?? undefined;

  const [status, setStatus] = useState<Status>({ loading: true, enabled: false, assistants: [] });
  const [assistantId, setAssistantId] = useState<string>();
  const [questions, setQuestions] = useState<Record<string, Question>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [thread, setThread] = useState<string[]>([]);
  const [docLabel, setDocLabel] = useState<string>();
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const watchers = useRef(new Map<string, () => void>());

  useEffect(() => {
    let live = true;
    fetchAssistants()
      .then((r) => {
        if (!live) return;
        const usable = r.assistants.filter((a) => a.ready);
        setStatus({ loading: false, enabled: r.ai_enabled && usable.length > 0, assistants: usable });
        setAssistantId(usable[0]?.id);
      })
      .catch(() => live && setStatus({ loading: false, enabled: false, assistants: [] }));
    fetchHistory()
      .then((rows) => {
        if (!live) return;
        setQuestions((m) => ({ ...Object.fromEntries(rows.map((q) => [q.id, q])), ...m }));
        setHistory((h) => [...h, ...rows.map((q) => q.id).filter((id) => !h.includes(id))]);
      })
      .catch((e: Error) => message.error(e.message));
    return () => {
      live = false;
    };
  }, [message]);

  useEffect(() => {
    if (!docId) {
      setDocLabel(undefined);
      return;
    }
    let live = true;
    fetchDocument(docId)
      .then((d) => live && setDocLabel(d ? `${d.doc_no} · ${d.title}` : undefined))
      .catch(() => live && setDocLabel(undefined));
    return () => {
      live = false;
    };
  }, [docId]);

  const update = useCallback(
    (q: Question) => setQuestions((m) => ({ ...m, [q.id]: { ...q, position: m[q.id]?.position } })),
    [],
  );

  useEffect(() => {
    const map = watchers.current;
    for (const id of thread) {
      const q = questions[id];
      if (!q) continue;
      if (isPending(q) && !map.has(id)) {
        map.set(
          id,
          watchQuestion(id, update, () => message.error("Mất kết nối theo dõi câu trả lời. Tải lại trang để xem.")),
        );
      } else if (!isPending(q) && map.has(id)) {
        map.get(id)?.();
        map.delete(id);
      }
    }
  }, [thread, questions, update, message]);

  useEffect(() => {
    const map = watchers.current;
    return () => {
      map.forEach((stop) => stop());
      map.clear();
    };
  }, []);

  const busy = sending || thread.some((id) => questions[id] && isPending(questions[id]));

  const send = async (text = input) => {
    const question = text.trim();
    if (!question || !assistantId || busy) return;
    setSending(true);
    try {
      const r = await ask(assistantId, question, docId);
      const now = new Date().toISOString();
      const q: Question = {
        id: r.id,
        question,
        status: r.status,
        answer: "",
        citations: [],
        guard: r.status === "refused" ? "prompt" : null,
        error: null,
        model: status.assistants.find((a) => a.id === assistantId)?.model ?? "",
        kb_document_id: docId ?? null,
        created_at: now,
        started_at: null,
        finished_at: null,
        position: r.position,
      };
      setQuestions((m) => ({ ...m, [q.id]: q }));
      setHistory((h) => [q.id, ...h]);
      setThread((t) => [...t, q.id]);
      setInput("");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const startNew = () => {
    setThread([]);
    setHistoryOpen(false);
    window.requestAnimationFrame(() => document.getElementById("assistant-input")?.focus());
  };

  const clearDoc = () => {
    const next = new URLSearchParams(params);
    next.delete("doc");
    setParams(next, { replace: true });
  };

  const shown = thread.map((id) => questions[id]).filter((q): q is Question => q != null);
  const last = shown[shown.length - 1];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Trợ lý đa năng</h1>
          <p className="mt-1 text-[13px] text-muted">
            Hỏi đáp Thư viện tri thức · trả lời có trích nguồn, chỉ trong phạm vi quyền của bạn
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen((v) => !v);
              window.requestAnimationFrame(() => document.getElementById("chat-session-search")?.focus());
            }}
            className={cn(secondaryButtonClass, "lg:hidden")}
          >
            <History className="h-4 w-4" aria-hidden />
            Lịch sử
          </button>
          <button type="button" onClick={startNew} className={primaryButtonClass} disabled={!status.enabled}>
            <Plus className="h-4 w-4" aria-hidden />
            Hỏi mới
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-190px)] lg:min-h-[560px] lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]">
        <ChatSidebar
          className={cn("max-h-[360px] lg:max-h-none", historyOpen ? "flex" : "hidden lg:flex")}
          questions={history.map((id) => questions[id]).filter((q): q is Question => q != null)}
          activeId={thread.length === 1 ? thread[0] : undefined}
          query={query}
          onQuery={setQuery}
          onSelect={(id) => {
            setThread([id]);
            setHistoryOpen(false);
          }}
        />

        {status.enabled ? (
          <ChatArea
            className="h-[calc(100dvh-200px)] min-h-[520px] lg:h-auto lg:min-h-0"
            assistants={status.assistants}
            assistantId={assistantId}
            onAssistant={setAssistantId}
            docLabel={docId ? (docLabel ?? "tài liệu đã chọn") : undefined}
            onClearDoc={clearDoc}
            scrollKey={`${shown.length}:${last?.status}:${last?.answer.length ?? 0}`}
            empty={shown.length === 0}
            canAsk={!busy}
            onSuggestion={(s) => void send(s)}
            input={<ChatInput value={input} onChange={setInput} onSend={() => void send()} busy={busy} />}
          >
            {shown.map((q) => (
              <div key={q.id} className="flex flex-col gap-4">
                <UserMessage text={q.question} />
                <AiMessage
                  q={q}
                  onRetry={() => void send(q.question)}
                  onCopy={() =>
                    void copyText(plainText(q)).then((ok) =>
                      ok ? message.success("Đã sao chép câu trả lời.") : message.error("Không sao chép được."),
                    )
                  }
                />
              </div>
            ))}
          </ChatArea>
        ) : (
          <AiOff loading={status.loading} />
        )}
      </div>
    </div>
  );
};

export default AiAssistantPage;
