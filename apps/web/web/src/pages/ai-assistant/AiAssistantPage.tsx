// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Trợ lý đa năng (Trí tuệ số): trái ~25% lịch sử phiên, phải ~75% khung chat (cuộn trong khung, ô nhập cố định ở đáy).
// Trang khác mở trợ lý kèm ngữ cảnh: ?record=HS-… · ?entity=urn:ngsi-ld:… · ?source=library → tạo phiên mới gắn ngữ cảnh.
// Câu trả lời đến từ bộ trả lời mẫu ./assistant (thay bằng API trợ lý nội bộ khi tích hợp).
import { App } from "antd";
import { History, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { primaryButtonClass, secondaryButtonClass } from "../../components/ui";
import { cn } from "../../utils/cn";
import { copyText } from "../../utils/clipboard";
import { contextFromParams, plainText, replyTo, suggestionsFor, titleFrom, totalMs } from "./assistant";
import { AiMessage } from "./components/AiMessage";
import { ChatArea } from "./components/ChatArea";
import { ChatInput } from "./components/ChatInput";
import { ChatSidebar } from "./components/ChatSidebar";
import { DraftFormModal } from "./components/DraftFormModal";
import { UserMessage } from "./components/UserMessage";
import { NEXT_DRAFT_CODE, SESSIONS } from "./mock";
import type { ActionProposal, AiMsg, AssistantMode, ChatSession, Message, Reply } from "./types";

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const newSession = (context?: string): ChatSession => ({ id: uid("s"), title: "Phiên mới", group: "today", context, messages: [] });

/** Phiên ban đầu: có ngữ cảnh từ URL thì mở phiên mới gắn ngữ cảnh đó, không thì mở phiên "OEE tuần này giảm". */
const initialState = (params: URLSearchParams) => {
  const ctx = contextFromParams(params);
  if (!ctx) return { sessions: SESSIONS, activeId: SESSIONS[0]?.id ?? "" };
  const s = newSession(ctx);
  return { sessions: [s, ...SESSIONS], activeId: s.id };
};

/** Mã nháp kế tiếp: HS-MOB-2026-00320, 00321… */
const draftCode = (n: number) => NEXT_DRAFT_CODE.replace(/\d{5}$/, (d) => String(Number(d) + n).padStart(5, "0"));

export const AiAssistantPage = () => {
  const { message } = App.useApp();
  const [params] = useSearchParams();

  const [init] = useState(() => initialState(params));
  const [sessions, setSessions] = useState<ChatSession[]>(init.sessions);
  const [activeId, setActiveId] = useState(init.activeId);
  const [mode, setMode] = useState<AssistantMode>("auto");
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [pending, setPending] = useState<{ key: string; sessionId: string; reply: Reply }>();
  const [feedback, setFeedback] = useState<Record<string, "up" | "down" | undefined>>({});
  const [drafts, setDrafts] = useState<Record<string, { code: string; action: ActionProposal }>>({});
  const [editing, setEditing] = useState<{ key: string; action: ActionProposal }>();
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const set = timers.current;
    return () => set.forEach((t) => window.clearTimeout(t));
  }, []);

  // Đang ở trang mà URL đổi ngữ cảnh (vd. bấm "Hỏi trợ lý" ở trang khác) → mở phiên mới cho ngữ cảnh đó.
  const paramKey = params.toString();
  const [seenParams, setSeenParams] = useState(paramKey);
  if (seenParams !== paramKey) {
    setSeenParams(paramKey);
    const ctx = contextFromParams(params);
    if (ctx) {
      const s = newSession(ctx);
      setSessions((list) => [s, ...list]);
      setActiveId(s.id);
    }
  }

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

  const patchSession = (id: string, fn: (s: ChatSession) => ChatSession) =>
    setSessions((list) => list.map((s) => (s.id === id ? fn(s) : s)));

  const focusInput = () => window.requestAnimationFrame(() => document.getElementById("assistant-input")?.focus());

  const send = (text = input) => {
    if (!active || pending) return;
    const question = text.trim();
    if (!question && files.length === 0) return;
    const sessionId = active.id;
    const shown = question || "Đọc giúp tôi các tệp đính kèm.";
    const user: Message = { id: uid("u"), role: "user", text: shown, files: files.length ? files : undefined };
    patchSession(sessionId, (s) => ({
      ...s,
      title: s.messages.length === 0 && s.title === "Phiên mới" ? titleFrom(shown) : s.title,
      messages: [...s.messages, user],
    }));
    const reply = replyTo(shown, { mode, context: active.context, files });
    const key = uid("p");
    setPending({ key, sessionId, reply });
    setInput("");
    setFiles([]);

    const delay = Math.min(2200, Math.max(700, totalMs(reply)));
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      const ai: AiMsg = { id: uid("a"), role: "assistant", ...reply };
      patchSession(sessionId, (s) => ({ ...s, messages: [...s.messages, ai] }));
      setPending((p) => (p?.key === key ? undefined : p));
    }, delay);
    timers.current.add(t);
  };

  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.clear();
    setPending(undefined);
    message.info("Đã dừng câu trả lời.");
  };

  const startNew = () => {
    if (active && active.messages.length === 0) {
      focusInput();
      return;
    }
    const s = newSession();
    setSessions((list) => [s, ...list]);
    setActiveId(s.id);
    setQuery("");
    setHistoryOpen(false);
    focusInput();
  };

  const createDraft = (key: string, action: ActionProposal) => {
    const code = draftCode(Object.keys(drafts).length);
    setDrafts((d) => ({ ...d, [key]: { code, action } }));
    message.success(`Đã tạo hồ sơ nháp ${code}. Bạn rà soát rồi tự gửi duyệt.`);
  };

  if (!active) return null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Trợ lý đa năng</h1>
          <p className="mt-1 text-[13px] text-muted">
            Một trợ lý, nhiều chuyên môn · trả lời có trích nguồn, chỉ trong phạm vi quyền của bạn
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
            className={secondaryButtonClass}
          >
            <History className="h-4 w-4" aria-hidden />
            Lịch sử
          </button>
          <button type="button" onClick={startNew} className={primaryButtonClass}>
            <Plus className="h-4 w-4" aria-hidden />
            Phiên mới
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-190px)] lg:min-h-[560px] lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]">
        <ChatSidebar
          className={cn("max-h-[360px] lg:max-h-none", historyOpen ? "flex" : "hidden lg:flex")}
          sessions={sessions}
          activeId={active.id}
          query={query}
          onQuery={setQuery}
          onSelect={(id) => {
            setActiveId(id);
            setHistoryOpen(false);
          }}
        />

        <ChatArea
          className="h-[calc(100dvh-200px)] min-h-[520px] lg:h-auto lg:min-h-0"
          session={active}
          mode={mode}
          onModeChange={setMode}
          onClearContext={() => patchSession(active.id, (s) => ({ ...s, context: undefined }))}
          thinking={pending?.sessionId === active.id ? { key: pending.key, steps: pending.reply.steps ?? [] } : undefined}
          suggestions={suggestionsFor(active.context)}
          onSuggestion={(s) => send(s)}
          input={
            <ChatInput
              value={input}
              onChange={setInput}
              files={files}
              onAddFiles={(names) => setFiles((f) => [...new Set([...f, ...names])])}
              onRemoveFile={(name) => setFiles((f) => f.filter((x) => x !== name))}
              onSend={() => send()}
              onStop={stop}
              responding={pending != null}
            />
          }
        >
          {active.messages.map((m) => {
            if (m.role === "user") return <UserMessage key={m.id} msg={m} />;
            // id tin nhắn mẫu lặp lại giữa các phiên → khóa theo phiên + tin nhắn.
            const k = `${active.id}:${m.id}`;
            const draft = drafts[k];
            return (
              <AiMessage
                key={m.id}
                msg={draft && m.action ? { ...m, action: draft.action } : m}
                feedback={feedback[k]}
                createdCode={draft?.code}
                onFeedback={(f) => {
                  const next = feedback[k] === f ? undefined : f;
                  setFeedback((prev) => ({ ...prev, [k]: next }));
                  if (next) message.success("Đã ghi nhận phản hồi. Cảm ơn bạn!");
                }}
                onCopy={() =>
                  void copyText(plainText(m.text, m.sources)).then((ok) =>
                    ok ? message.success("Đã sao chép câu trả lời.") : message.error("Không sao chép được."),
                  )
                }
                onEditDraft={() => m.action && setEditing({ key: k, action: m.action })}
                onConfirmDraft={() => m.action && createDraft(k, m.action)}
              />
            );
          })}
        </ChatArea>
      </div>

      <DraftFormModal
        action={editing?.action}
        onCancel={() => setEditing(undefined)}
        onSubmit={(v) => {
          if (!editing) return;
          createDraft(editing.key, { ...editing.action, ...v });
          setEditing(undefined);
        }}
      />
    </div>
  );
};

export default AiAssistantPage;
