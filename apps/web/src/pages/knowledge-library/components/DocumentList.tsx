import { SearchX } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { LibraryDoc } from "../types";
import { docMeta } from "../utils";
import { IndexStatus } from "./IndexStatus";
import { tr } from "../../../i18n";

export const DocumentList = ({
  docs,
  selectedId,
  onSelect,
  className,
}: {
  docs: LibraryDoc[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}) => {
  const move = (delta: number) => {
    const i = docs.findIndex((d) => d.id === selectedId);
    const next = docs[Math.min(docs.length - 1, Math.max(0, i + delta))];
    if (next) {
      onSelect(next.id);
      document.getElementById(`kb-item-${next.id}`)?.focus();
    }
  };

  return (
    <section
      aria-label={tr("Danh sách tài liệu")}
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-surface shadow-card", className)}
    >
      {docs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <SearchX className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13px] font-medium text-ink">{tr("Không tìm thấy tài liệu phù hợp")}</p>
          <p className="text-[12px] text-muted">{tr("Thử từ khóa khác hoặc bỏ bớt bộ lọc.")}</p>
        </div>
      ) : (
        <ul
          className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              move(e.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {docs.map((d, i) => {
            const selected = d.id === selectedId;
            const prevSelected = docs[i - 1]?.id === selectedId;
            return (
              <li key={d.id} className="relative">
                {i > 0 && !selected && !prevSelected && (
                  <span className="absolute inset-x-3 top-0 h-px bg-line/80" aria-hidden />
                )}
                <button
                  id={`kb-item-${d.id}`}
                  type="button"
                  onClick={() => onSelect(d.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                    selected ? "border-bamboo-200 bg-bamboo-50" : "border-transparent hover:bg-canvas",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{d.title}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">{docMeta(d)}</span>
                  </span>
                  <span className="pt-0.5">
                    <IndexStatus state={d.index} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
