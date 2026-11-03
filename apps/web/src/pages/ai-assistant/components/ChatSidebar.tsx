// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Search } from "lucide-react";

import { cn } from "../../../utils/cn";
import { fold } from "../../../utils/text";
import { GROUP_LABEL, groupOf, titleFrom } from "../assistant";
import type { HistoryGroup, Question } from "../types";
import { tr } from "../../../i18n";

const GROUPS: HistoryGroup[] = ["today", "yesterday", "lastWeek", "older"];

export const ChatSidebar = ({
  questions,
  activeId,
  query,
  onQuery,
  onSelect,
  className,
}: {
  questions: Question[];
  activeId?: string;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  className?: string;
}) => {
  const q = fold(query.trim());
  const visible = q ? questions.filter((x) => fold(`${x.question} ${x.answer}`).includes(q)) : questions;

  return (
    <aside
      aria-label={tr("Lịch sử lượt hỏi")}
      className={cn("min-h-0 flex-col rounded-2xl border border-line bg-surface p-3 shadow-card", className)}
    >
      <label className="relative block">
        <span className="sr-only">{tr("Tìm lượt hỏi")}</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          id="chat-session-search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={tr("Tìm lượt hỏi")}
          className="h-9 w-full rounded-xl border border-transparent bg-canvas pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted focus:border-bamboo-400 focus:bg-surface focus:ring-3 focus:ring-bamboo-100 [&::-webkit-search-cancel-button]:hidden"
        />
      </label>

      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {visible.length === 0 && (
          <p className="px-2 py-6 text-center text-[12.5px] text-muted">
            {questions.length ? tr("Không có lượt hỏi phù hợp.") : tr("Chưa có lượt hỏi nào.")}
          </p>
        )}
        {GROUPS.map((g) => {
          const items = visible.filter((x) => groupOf(x.created_at) === g);
          if (!items.length) return null;
          return (
            <section key={g} className="mb-3">
              <h2 className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                {GROUP_LABEL[g]}
              </h2>
              <ul className="m-0 list-none space-y-0.5 p-0">
                {items.map((x) => {
                  const active = x.id === activeId;
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(x.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "block w-full truncate rounded-lg px-2 py-2 text-left text-[13px] transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                          active ? "bg-bamboo-50 font-semibold text-ink" : "text-body hover:bg-canvas hover:text-ink",
                        )}
                      >
                        {titleFrom(x.question)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </nav>

      <p className="mt-2 border-t border-line px-2 pt-2.5 text-[11px] leading-snug text-muted">
        {tr("Mỗi lượt hỏi độc lập, không dùng lại lượt trước. Thông tin cá nhân được che trước khi lưu.")}
      </p>
    </aside>
  );
};
