// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Select } from "antd";
import { SearchX } from "lucide-react";
import { formatSeconds } from "../engine";
import type { SearchResult, SortKey } from "../types";
import { ResultItem } from "./ResultItem";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "relevance", label: "Phù hợp nhất" },
  { value: "newest", label: "Mới nhất" },
];

/** Cột kết quả: tổng số + thời gian, sắp xếp, danh sách, "Xem thêm". */
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
  /** Kết quả đang hiển thị (đã cắt trang). */
  results: SearchResult[];
  total: number;
  /** Máy chủ còn kết quả chưa tải. */
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
    <section aria-label="Kết quả" className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted" aria-live="polite">
          <b className="text-[16px] font-semibold text-ink">
            {total}
            {moreOnServer ? "+" : ""} kết quả
          </b>{" "}
          · {formatSeconds(elapsedMs)}
        </p>
        <Select<SortKey>
          value={sort}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          style={{ width: 150 }}
          aria-label="Sắp xếp kết quả"
        />
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          Không tìm được trong đề nghị mua sắm và tệp đính kèm: {error}. Các kết quả khác vẫn hiển thị.
        </p>
      )}

      {results.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <SearchX className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13.5px] font-medium text-ink">Không tìm thấy kết quả cho “{query}”.</p>
          <p className="text-[12px] text-muted">Thử bỏ bớt bộ lọc, đổi sang “Kết hợp”, hoặc gõ cách nói khác.</p>
        </div>
      ) : (
        <ul className="m-0 mt-2 list-none p-0" aria-label={`Kết quả cho ${query}`}>
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
            {remaining > 0 ? `Xem thêm ${remaining} kết quả` : "Xem thêm"}
          </button>
        </div>
      )}
    </section>
  );
};
