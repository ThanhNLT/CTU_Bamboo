import { LoaderCircle, Search, X } from "lucide-react";

import { primaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { SearchMode } from "../types";
import { tr } from "../../../i18n";

const MODES: Array<{ key: SearchMode; label: string; hint: string }> = [
  { key: "keyword", label: tr("Từ khóa"), hint: tr("Chỉ trả về kết quả chứa đủ các từ đã gõ (không dấu cũng được)") },
  { key: "semantic", label: tr("Ngữ nghĩa"), hint: tr("Tìm theo ý nghĩa câu hỏi, kể cả cách nói khác") },
  { key: "hybrid", label: tr("Kết hợp"), hint: tr("Gộp cả hai, xếp theo độ phù hợp") },
];

export const SearchBar = ({
  value,
  onChange,
  onSubmit,
  mode,
  onModeChange,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  mode: SearchMode;
  onModeChange: (m: SearchMode) => void;
  loading: boolean;
}) => (
  <form
    role="search"
    className="flex flex-col gap-3 lg:flex-row lg:items-center"
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
  >
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{tr("Tìm kiếm")}</span>
      {loading ? (
        <LoaderCircle
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bamboo-600 motion-safe:animate-spin"
          aria-hidden
        />
      ) : (
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
      )}
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={tr("Tìm kiếm")}
        autoFocus
        autoComplete="off"
        placeholder={tr("Hồ sơ, tài liệu, thiết bị, số chứng từ… (gõ không dấu được)")}
        className="h-11 w-full rounded-ui border border-line bg-surface pl-11 pr-10 text-[14px] text-ink shadow-card outline-none transition-colors placeholder:text-muted hover:border-bamboo-200 focus:border-bamboo-400 focus:ring-3 focus:ring-bamboo-100 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={tr("Xóa nội dung đang tìm")}
          className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </label>

    <div className="flex items-center gap-3">
      <div role="group" aria-label={tr("Cách tìm")} className="inline-flex gap-0.5 rounded-full bg-black/[0.045] p-1">
        {MODES.map((m) => {
          const active = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              title={m.hint}
              aria-pressed={active}
              onClick={() => onModeChange(m.key)}
              className={cn(
                "h-8 whitespace-nowrap rounded-full px-3.5 text-[12.5px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                active ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <button type="submit" className={cn(primaryButtonClass, "h-11")}>
        <Search className="h-4 w-4" aria-hidden />
        {tr("Tìm")}
      </button>
    </div>
  </form>
);
