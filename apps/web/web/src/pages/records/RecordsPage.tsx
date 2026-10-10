// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hồ sơ (Quy trình số): master–detail. Trái ~65% bảng hồ sơ (thân bảng cuộn riêng, có phân trang),
// phải ~35% chi tiết hồ sơ đang chọn (cuộn riêng). Dữ liệu minh họa ở ./mock — đếm tab, lọc, phân trang
// đều tính từ dữ liệu nên đổi sang API chỉ cần thay nguồn dữ liệu.
import { useGo } from "@refinedev/core";
import { App } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { RecordDetailPanel } from "./components/RecordDetailPanel";
import { RecordsFilterBar } from "./components/RecordsFilterBar";
import { RecordsHeader } from "./components/RecordsHeader";
import { RecordsTable } from "./components/RecordsTable";
import { COMPANY, MOCK_INCOMING, MOCK_ME, MOCK_NOW, MOCK_RECORDS } from "./mock";
import type { EofficeRecord, RecordFilters } from "./types";
import { countByTab, filterExceptTab, matchesTab } from "./utils";

const PAGE_SIZE = 20;
const CTX = { me: MOCK_ME, now: MOCK_NOW };

const INITIAL_FILTERS: RecordFilters = { tab: "all", query: "", type: "all", range: "30d", mineOnly: false };

export const RecordsPage = () => {
  const go = useGo();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [records, setRecords] = useState<EofficeRecord[]>(MOCK_RECORDS);
  const [incoming, setIncoming] = useState<EofficeRecord[]>(MOCK_INCOMING);
  const [filters, setFilters] = useState<RecordFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>(MOCK_RECORDS[0]?.id);

  const { tab, query, type, range, mineOnly } = filters;
  const base = useMemo(
    () => filterExceptTab(records, { query, type, range, mineOnly }, CTX),
    [records, query, type, range, mineOnly],
  );
  const counts = useMemo(() => countByTab(base), [base]);
  const filtered = useMemo(() => base.filter((r) => matchesTab(r.status, tab)), [base, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  // Hồ sơ đang chọn bị lọc mất thì chuyển sang dòng đầu của trang hiện tại.
  const selected = filtered.find((r) => r.id === selectedId) ?? rows[0];

  const updateFilters = (patch: Partial<RecordFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  // Áp các cập nhật "đến sau": thay hồ sơ đã có, thêm hồ sơ mới lên đầu.
  const refresh = () => {
    setRecords((prev) => {
      const byId = new Map(incoming.map((r) => [r.id, r]));
      const replaced = prev.map((r) => byId.get(r.id) ?? r);
      const added = incoming.filter((r) => !prev.some((p) => p.id === r.id));
      return [...added, ...replaced];
    });
    message.success(`Đã cập nhật ${incoming.length} hồ sơ.`);
    setIncoming([]);
    setPage(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <RecordsHeader
        company={COMPANY}
        onOcr={() => navigate("/i/ocr")}
        onCreate={() => go({ to: { resource: "proc_purchase_request", action: "create" } })}
      />

      <RecordsFilterBar filters={filters} counts={counts} onChange={updateFilters} />

      <div className="grid grid-cols-1 gap-5 xl:h-[calc(100dvh-300px)] xl:min-h-[520px] xl:grid-cols-[minmax(0,13fr)_minmax(300px,7fr)]">
        <RecordsTable
          className="max-h-[720px] xl:max-h-none"
          rows={rows}
          total={filtered.length}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          page={safePage}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          pendingUpdates={incoming.length}
          onRefresh={refresh}
        />
        <RecordDetailPanel
          record={selected}
          me={MOCK_ME}
          onReview={(r) => navigate(`/p/tasks?code=${encodeURIComponent(r.code)}`)}
          onOpen={(r) => message.info(`Trang chi tiết ${r.code} sẽ có khi nối API e-Office.`)}
          onAsk={(r) => navigate(`/i/assistant?record=${encodeURIComponent(r.code)}`)}
        />
      </div>
    </div>
  );
};

export default RecordsPage;
