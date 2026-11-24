/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { App } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { request } from "../../api/client";
import { AiContextBanner } from "./components/AiContextBanner";
import { SearchBar } from "./components/SearchBar";
import { SearchFilters } from "./components/SearchFilters";
import { SearchResultList } from "./components/SearchResultList";
import { applyFilters, facetCounts, highlightTerms, sortResults } from "./engine";
import { DEFAULT_TYPES, EXAMPLE_QUERIES } from "./labels";
import type { Company, ResultType, SearchMode, SortKey, TimeRange } from "./types";
import { useDocumentSearch } from "./useDocumentSearch";
import { useEntitySearch } from "./useEntitySearch";
import { tr, trf } from "../../i18n";

const NO_COMPANIES: Company[] = [];

const PAGE_SIZE = 6;
const MORE_STEP = 10;
const MODES: SearchMode[] = ["keyword", "semantic", "hybrid"];

export const SearchPage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const modeParam = params.get("mode") as SearchMode | null;
  const mode: SearchMode = modeParam && MODES.includes(modeParam) ? modeParam : "hybrid";

  const [text, setText] = useState(() => params.get("q") ?? "");
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    if (q !== text.trim()) setText(q);
  }

  const [types, setTypes] = useState<ResultType[]>(DEFAULT_TYPES);
  const [range, setRange] = useState<TimeRange>("all");
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

  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const t = window.setTimeout(() => setUrl({ q: next }), 250);
    return () => window.clearTimeout(t);
  }, [text, q, setUrl]);

  const docs = useDocumentSearch(q, true, mode);
  const entities = useEntitySearch(q);

  const terms = useMemo(() => highlightTerms(q), [q]);

  const computed = useMemo(() => {
    const t0 = performance.now();
    const rows = [...docs.results, ...entities.results];
    const filters = { types, companies: NO_COMPANIES, range };
    const filtered = sortResults(applyFilters(rows, filters), sort);
    return { filtered, counts: facetCounts(rows, filters), ms: performance.now() - t0 };
  }, [docs.results, entities.results, types, range, sort]);

  const pageKey = `${q}|${mode}|${types.join()}|${range}|${sort}`;
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Tìm kiếm")}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {tr(
            "Tìm trong hồ sơ, tài liệu, tri thức, thiết bị và dữ liệu bạn được phép xem · từ khóa, gõ không dấu cũng được",
          )}
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
            concepts={[]}
            onAsk={() => navigate(`/i/assistant?context=${encodeURIComponent(trf("Tìm kiếm · “{0}”", [q]))}`)}
          />

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]">
            <SearchFilters
              className="lg:sticky lg:top-4"
              types={types}
              onTypesChange={setTypes}
              companies={NO_COMPANIES}
              onCompaniesChange={() => undefined}
              permitted={NO_COMPANIES}
              range={range}
              onRangeChange={setRange}
              counts={computed.counts}
              hiddenCount={0}
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
              error={docs.error ?? entities.error}
              terms={terms}
              onDownload={(id) => void download(id)}
            />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="text-[13.5px] font-medium text-ink">{tr("Nhập từ khóa để tìm trong mọi thứ bạn được xem.")}</p>
          <p className="mt-1 text-[12.5px] text-muted">{tr("Gõ không dấu cũng được. Thử:")}</p>
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
