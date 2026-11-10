/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Search, X } from "lucide-react";

import { cn } from "../../utils/cn";
import { tr } from "../../i18n";

export const SearchInput = ({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) => (
  <label className={cn("relative block min-w-0", className)}>
    <span className="sr-only">{label ?? placeholder}</span>
    <Search
      className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted"
      aria-hidden
    />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-ui border border-line bg-surface pl-10 pr-9 text-[13.5px] text-ink shadow-card outline-none transition-colors placeholder:text-muted hover:border-bamboo-200 focus:border-bamboo-400 focus:ring-3 focus:ring-bamboo-100 [&::-webkit-search-cancel-button]:hidden"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label={tr("Xóa từ khóa")}
        className="absolute right-2.5 top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-[var(--glass-well)] hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </label>
);
