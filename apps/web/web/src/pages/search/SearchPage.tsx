// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Tìm kiếm (Trí tuệ số): một ô tìm cho mọi thứ người dùng được xem.
// - Đề nghị mua sắm + tệp đính kèm: tìm THẬT qua search_documents (máy chủ lọc tenant/quyền).
// - Bản sao số, tri thức, tài liệu, dữ liệu, hồ sơ e-Office mẫu: chỉ mục mẫu ./mock (thay cho Qdrant khi tích hợp).
// Từ khóa và cách tìm giữ trên URL (?q=…&mode=…) để chia sẻ được đường dẫn.
import { App } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { AiContextBanner } from "./components/AiContextBanner";
import { SearchBar } from "./components/SearchBar";
import { SearchFilters } from "./components/SearchFilters";
import { SearchResultList } from "./components/SearchResultList";
import {
  applyFilters,
  defaultCompanies,
  detectConcepts,
  facetCounts,
  highlightTerms,
  permittedCompanies,
  searchIndex,
  sortResults,
} from "./engine";
import { DEFAULT_QUERY, DEFAULT_TYPES, EXAMPLE_QUERIES } from "./mock";
import type { Company, ResultType, SearchMode, SortKey, TimeRange } from "./types";
import { useDocumentSearch } from "./useDocumentSearch";

const PAGE_SIZE = 6;
const MORE_STEP = 10;
const MODES: SearchMode[] = ["keyword", "semantic", "hybrid"];

export const SearchPage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { tenant } = useSession();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const modeParam = params.get("mode") as SearchMode | null;
  const mode: SearchMode = modeParam && MODES.includes(modeParam) ? modeParam : "hybrid";

  // Mở trang không có ?q= thì điền sẵn câu ví dụ (như thiết kế); xóa ô là xóa hẳn.
  const [text, setText] = useState(() => params.get("q") ?? DEFAULT_QUERY);
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    // URL đổi từ nơi khác (Back/Forward, liên kết) → cập nhật ô nhập.
    setSeenQ(q);
    if (q !== text.trim()) setText(q);
  }

  const permitted = useMemo(() => permittedCompanies(tenant.tenant_name), [tenant.tenant_name]);
  const [types, setTypes] = useState<ResultType[]>(DEFAULT_TYPES);
  const [companies, setCompanies] = useState<Company[]>(() => defaultCompanies(permitted));
  // Đổi đơn vị (tenant) → phạm vi công ty đổi → chọn lại mặc định.
  const [seenPermitted, setSeenPermitted] = useState(permitted);
  if (seenPermitted !== permitted) {
    setSeenPermitted(permitted);
    setCompanies(defaultCompanies(permitted));
  }
  const [range, setRange] = useState<TimeRange>("30d");
  const [sort, setSort] = useState<SortKey>("relevance");

  const setUrl = useCallback(
    (next: { q?: string; mode?: SearchMode }) => {
      const p = new URLSearchParams(params);
      const nq = next.q ?? q;
      const nm = next.mode ?? mode;
      if (nq) p.set("q", nq);
      else p.delete("q");
      if (nm !== "hybrid") p.set("mode", nm);
      else p.delete("mode");
      setParams(p, { replace: true });
    },
    [params, setParams, q, mode],
  );

  // Gõ tới đâu tìm tới đó, chờ 250 ms sau lần gõ cuối.
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const t = window.setTimeout(() => setUrl({ q: next }), 250);
    return () => window.clearTimeout(t);
  }, [text, q, setUrl]);

  // Tìm thật chỉ khớp từ khóa → bỏ qua ở chế độ "Ngữ nghĩa".
  const docs = useDocumentSearch(q, mode !== "semantic");

  const concepts = useMemo(() => detectConcepts(q), [q]);
  const terms = useMemo(() => highlightTerms(q, mode), [q, mode]);

  const computed = useMemo(() => {
    const t0 = performance.now();
    const all = q ? searchIndex(q, mode) : [];
    const visible = all.filter((r) => r.company == null || permitted.includes(r.company));
    const hidden = all.length - visible.length;
    const rows = [...visible, ...docs.results];
    const filters = { types, companies, range };
    const filtered = sortResults(applyFilters(rows, filters), sort);
    return { filtered, hidden, counts: facetCounts(rows, filters), ms: performance.now() - t0 };
  }, [q, mode, permitted, docs.results, types, companies, range, sort]);

  // Số kết quả đang hiện: về lại trang đầu mỗi khi đổi câu hỏi / bộ lọc.
  const pageKey = `${q}|${mode}|${types.join()}|${companies.join()}|${range}|${sort}`;
  const [page, setPage] = useState({ key: pageKey, size: PAGE_SIZE });
  const size = page.key === pageKey ? page.size : PAGE_SIZE;
  const shown = computed.filtered.slice(0, size);

  const showMore = () => {
    setPage({ key: pageKey, size: size + MORE_STEP });
    if (size + MORE_STEP >= computed.filtered.length && docs.more) void docs.loadMore();
  };

  const download = async (attachmentId: string) => {
    try {
      const { get_download_url } = await request<{ get_download_url: { url: string } }>(
        `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
        { a: attachmentId },
      );
      window.open(get_download_url.url, "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Tìm kiếm</h1>
        <p className="mt-1 text-[13px] text-muted">
          Tìm trong hồ sơ, tài liệu, tri thức và dữ liệu bạn được phép xem · ngữ nghĩa (Qdrant) + từ khóa
        </p>
      </div>

      <SearchBar
        value={text}
        onChange={setText}
        onSubmit={() => (text.trim() === q ? void docs.reload() : setUrl({ q: text.trim() }))}
        mode={mode}
        onModeChange={(m) => setUrl({ mode: m, q: text.trim() })}
        loading={docs.loading}
      />

      {q ? (
        <>
          <AiContextBanner
            query={q}
            mode={mode}
            concepts={concepts}
            onAsk={() => navigate(`/i/assistant?context=${encodeURIComponent(`Tìm kiếm · “${q}”`)}`)}
          />

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]">
            <SearchFilters
              className="lg:sticky lg:top-4"
              types={types}
              onTypesChange={setTypes}
              companies={companies}
              onCompaniesChange={setCompanies}
              permitted={permitted}
              range={range}
              onRangeChange={setRange}
              counts={computed.counts}
              hiddenCount={computed.hidden}
            />
            <SearchResultList
              query={q}
              results={shown}
              total={computed.filtered.length}
              moreOnServer={docs.more}
              elapsedMs={Math.max(docs.ms, computed.ms)}
              sort={sort}
              onSortChange={setSort}
              onShowMore={showMore}
              loading={docs.loading}
              error={docs.error}
              terms={terms}
              onDownload={(id) => void download(id)}
            />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <p className="text-[13.5px] font-medium text-ink">Nhập từ khóa để tìm trong mọi thứ bạn được xem.</p>
          <p className="mt-1 text-[12.5px] text-muted">Gõ không dấu cũng được. Thử:</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setText(ex);
                  setUrl({ q: ex });
                }}
                className="h-8 rounded-full bg-black/[0.045] px-3.5 text-[12.5px] font-medium text-ink hover:bg-bamboo-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
