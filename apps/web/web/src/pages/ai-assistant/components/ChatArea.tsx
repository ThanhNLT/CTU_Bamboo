// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Sparkles, X } from "lucide-react"; // Lucide React
import { useEffect, useRef, type ReactNode } from "react"; // React

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import { MODEL_LABEL, MODES, SCOPE_NOTE } from "../mock";
import type { AssistantMode, ChatSession, ToolStep } from "../types";
import { ThinkingMessage } from "./ThinkingMessage";

// ===== Component =====
const ModeTabs = ({ value, onChange }: { value: AssistantMode; onChange: (m: AssistantMode) => void }) => (
  <div
    role="tablist"
    aria-label="Chuyên môn của trợ lý"
    className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/[0.045] p-1"
  >
    {MODES.map((m) => {
      const active = m.key === value;
      return (
        <button
          key={m.key}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(m.key)}
          className={cn(
            "h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-[12px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
            active ? "bg-white font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {m.label}
        </button>
      );
    })}
  </div>
);

/**
 * Khung chat: thanh chế độ + mô hình, băng ngữ cảnh, vùng tin nhắn cuộn được, gợi ý và ô nhập cố định ở đáy.
 * `children` là danh sách tin nhắn đã dựng sẵn.
 */
export const ChatArea = ({
  session,
  mode,
  onModeChange,
  onClearContext,
  thinking,
  suggestions,
  onSuggestion,
  input,
  children,
  className,
}: {
  session: ChatSession;
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
  onClearContext: () => void;
  /** Có giá trị = trợ lý đang xử lý (đối với phiên này). */
  thinking?: { key: string; steps: ToolStep[] };
  suggestions: string[];
  onSuggestion: (s: string) => void;
  input: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = session.messages.length;

  // Có tin nhắn mới / đổi phiên / bắt đầu xử lý → cuộn xuống cuối.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [count, session.id, thinking?.key]);

  return (
    <section
      aria-label="Trò chuyện với trợ lý"
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-white shadow-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <ModeTabs value={mode} onChange={onModeChange} />
        <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-line px-2.5 text-[11.5px] text-body">
          {MODEL_LABEL}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 sm:px-5">
        {session.context && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-bamboo-200 bg-white pl-1.5 pr-3 text-[12px] font-semibold text-bamboo-800">
            <button
              type="button"
              onClick={onClearContext}
              aria-label="Bỏ ngữ cảnh"
              className="grid h-5 w-5 place-items-center rounded-full text-bamboo-700 hover:bg-bamboo-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
            Ngữ cảnh: {session.context}
          </span>
        )}
        <span className="text-[11.5px] text-muted">{SCOPE_NOTE}</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {count === 0 && !thinking ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-bamboo-50 text-bamboo-600" aria-hidden>
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="text-[15px] font-semibold text-ink">Bạn cần hỏi gì?</p>
            <p className="max-w-sm text-[12.5px] text-muted">
              Hỏi về hồ sơ, số liệu, quy chế hay thiết bị. Câu trả lời luôn kèm nguồn, và trợ lý chỉ thấy dữ liệu bạn có
              quyền xem.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">
            {children}
            {thinking && <ThinkingMessage key={thinking.key} steps={thinking.steps} />}
          </div>
        )}
      </div>

      <div className="border-t border-line/70 px-4 pb-4 pt-3 sm:px-5">
        <div className="mx-auto max-w-[860px]">
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                disabled={thinking != null}
                className="h-7 shrink-0 whitespace-nowrap rounded-full bg-black/[0.045] px-3 text-[12px] font-medium text-ink transition-colors hover:bg-bamboo-50 hover:text-bamboo-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500"
              >
                {s}
              </button>
            ))}
          </div>
          {input}
        </div>
      </div>
    </section>
  );
};
