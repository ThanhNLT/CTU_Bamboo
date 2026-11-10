/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Select } from "antd";
import { SearchX } from "lucide-react";

import { formatSeconds } from "../engine";
import type { SearchResult, SortKey } from "../types";
import { ResultItem } from "./ResultItem";
import { tr, trf } from "../../../i18n";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "relevance", label: tr("Phù hợp nhất") },
  { value: "newest", label: tr("Mới nhất") },
];

export const SearchResultList = ({
  query,
  results,
  total,
  moreOnServer,
  elapsedMs,
  sort,
  onSortChange,
  onShowMore,
  loading,
  error,
  terms,
  onDownload,
}: {
  query: string;
  results: SearchResult[];
  total: number;
  moreOnServer: boolean;
  elapsedMs: number;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  onShowMore: () => void;
  loading: boolean;
  error?: string;
  terms: string[];
  onDownload: (attachmentId: string) => void;
}) => {
  const remaining = total - results.length;
  return (
    <section aria-label={tr("Kết quả")} className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted" aria-live="polite">
          <b className="text-[16px] font-semibold text-ink">
            {total}
            {moreOnServer ? "+" : ""} {tr(" kết quả")}
          </b>{" "}
          · {formatSeconds(elapsedMs)}
        </p>
        <Select<SortKey>
          value={sort}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          style={{ width: 150 }}
          aria-label={tr("Sắp xếp kết quả")}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          {tr("Không tìm được trong đề nghị mua sắm và tệp đính kèm: ")} {error}
          {tr(". Các kết quả khác vẫn hiển thị.")}
        </p>
      )}

      {results.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <SearchX className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13.5px] font-medium text-ink">
            {tr("Không tìm thấy kết quả cho “")}
            {query}”.
          </p>
          <p className="text-[12px] text-muted">
            {tr("Thử bỏ bớt bộ lọc, đổi sang “Kết hợp”, hoặc gõ cách nói khác.")}
          </p>
        </div>
      ) : (
        <ul className="m-0 mt-2 list-none p-0" aria-label={trf("Kết quả cho {0}", [query])}>
          {results.map((r) => (
            <ResultItem key={r.key} result={r} terms={terms} onDownload={onDownload} />
          ))}
        </ul>
      )}

      {(remaining > 0 || moreOnServer) && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={onShowMore}
            disabled={loading}
            className="h-8 rounded-full bg-black/[0.045] px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-bamboo-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
          >
            {remaining > 0 ? trf("Xem thêm {0} kết quả", [remaining]) : tr("Xem thêm")}
          </button>
        </div>
      )}
    </section>
  );
};
