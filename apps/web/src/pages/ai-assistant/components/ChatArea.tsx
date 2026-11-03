// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { BookOpen, Sparkles, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "../../../utils/cn";
import type { Assistant } from "../types";
import { tr } from "../../../i18n";

const SUGGESTIONS = [
  tr("Đề nghị mua sắm từ 50 triệu đồng do ai duyệt?"),
  tr("Cần bao nhiêu báo giá khi mua hàng?"),
  tr("Nhà cung cấp mới được thêm vào danh mục thế nào?"),
];

export const ChatArea = ({
  assistants,
  assistantId,
  onAssistant,
  docLabel,
  onClearDoc,
  scrollKey,
  empty,
  canAsk,
  onSuggestion,
  input,
  children,
  className,
}: {
  assistants: Assistant[];
  assistantId?: string;
  onAssistant: (id: string) => void;
  docLabel?: string;
  onClearDoc: () => void;
  scrollKey: string;
  empty: boolean;
  canAsk: boolean;
  onSuggestion: (s: string) => void;
  input: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const current = assistants.find((a) => a.id === assistantId);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [scrollKey]);

  return (
    <section
      aria-label={tr("Hỏi trợ lý")}
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-surface shadow-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        {assistants.length > 1 ? (
          <label className="flex items-center gap-2 text-[12.5px] text-body">
            <span>{tr("Trợ lý")}</span>
            <select
              value={assistantId}
              onChange={(e) => onAssistant(e.target.value)}
              className="h-8 rounded-ui border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink outline-none focus:border-bamboo-400 focus:ring-3 focus:ring-bamboo-100"
            >
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <BookOpen className="h-4 w-4 text-bamboo-600" aria-hidden />
            {current?.name ?? tr("Tri thức")}
          </span>
        )}
        {current && (
          <span className="inline-flex h-6 shrink-0 items-center rounded-ui border border-line px-2.5 text-[11.5px] text-body">
            Ollama · {current.model}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 sm:px-5">
        {docLabel && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-ui border border-bamboo-200 bg-surface pl-1.5 pr-3 text-[12px] font-semibold text-bamboo-800">
            <button
              type="button"
              onClick={onClearDoc}
              aria-label={tr("Bỏ giới hạn tài liệu")}
              className="grid h-5 w-5 place-items-center rounded-ui text-bamboo-700 hover:bg-bamboo-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
            {tr("Đang hỏi trong: ")} {docLabel}
          </span>
        )}
        <span className="text-[11.5px] text-muted">
          {tr("Chỉ trả lời từ tài liệu đang hiệu lực trong Thư viện tri thức mà bạn được xem")}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-ui bg-bamboo-50 text-bamboo-600" aria-hidden>
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="text-[15px] font-semibold text-ink">{tr("Bạn cần hỏi gì?")}</p>
            <p className="max-w-sm text-[12.5px] text-muted">
              {tr(
                "Hỏi về quy chế, quy trình và hướng dẫn. Câu trả lời luôn kèm nguồn, và trợ lý chỉ đọc tài liệu bạn có quyền xem. Mô hình chạy cục bộ nên có thể mất vài chục giây.",
              )}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">{children}</div>
        )}
      </div>

      <div className="border-t border-line/70 px-4 pb-4 pt-3 sm:px-5">
        <div className="mx-auto max-w-[860px]">
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                disabled={!canAsk}
                className="h-7 shrink-0 whitespace-nowrap rounded-ui bg-black/[0.045] px-3 text-[12px] font-medium text-ink transition-colors hover:bg-bamboo-50 hover:text-bamboo-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500"
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
