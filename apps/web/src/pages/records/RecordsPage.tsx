/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useGo } from "@refinedev/core";
import { Alert } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { useDocuments } from "../../api/documents";
import { useSession } from "../../auth/useSession";
import { formatAgo } from "../../utils/format";
import { useInboxTasks } from "../inbox/useInboxTasks";
import { RecordDetailPanel } from "./components/RecordDetailPanel";
import { RecordsFilterBar } from "./components/RecordsFilterBar";
import { RecordsHeader } from "./components/RecordsHeader";
import { RecordsTable } from "./components/RecordsTable";
import type { RecordFilters } from "./types";
import { countByTab, filterExceptTab, matchesTab, toRecord } from "./utils";
import { tr } from "../../i18n";

const PAGE_SIZE = 20;
const FETCH_LIMIT = 500;

const INITIAL_FILTERS: RecordFilters = { tab: "all", query: "", type: "all", range: "30d", mineOnly: false };

export const RecordsPage = () => {
  const go = useGo();
  const navigate = useNavigate();
  const { tenant } = useSession();
  const docs = useDocuments({ limit: FETCH_LIMIT });
  const inbox = useInboxTasks({ team: false });

  const records = useMemo(() => docs.documents.map(toRecord), [docs.documents]);
  const myTasks = useMemo(() => new Set(inbox.mine.map((t) => t.code)), [inbox.mine]);

  const [filters, setFilters] = useState<RecordFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const { tab, query, type, range, mineOnly } = filters;
  const base = useMemo(
    () =>
      filterExceptTab(records, { query, type, range, mineOnly }, { me: tenant.person_id, now: Date.now(), myTasks }),
    [records, query, type, range, mineOnly, tenant.person_id, myTasks],
  );
  const counts = useMemo(() => countByTab(base), [base]);
  const filtered = useMemo(() => base.filter((r) => matchesTab(r.status, tab)), [base, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = filtered.find((r) => r.id === selectedId) ?? rows[0];

  const updateFilters = (patch: Partial<RecordFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <RecordsHeader
        company={tenant.tenant_name}
        onOcr={() => navigate("/i/ocr")}
        onCreate={() => go({ to: { resource: "proc_purchase_request", action: "create" } })}
      />

      {docs.error && <Alert type="error" showIcon message={tr("Không tải được hồ sơ")} description={docs.error} />}

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
          formatUpdated={formatAgo}
          loading={docs.loading}
        />
        <RecordDetailPanel
          record={selected}
          canReview={selected ? myTasks.has(selected.code) : false}
          onReview={(r) => navigate(`/p/tasks?doc=${encodeURIComponent(r.code)}`)}
          onOpen={(r) => navigate(r.to)}
          onAsk={(r) => navigate(`/i/assistant?record=${encodeURIComponent(r.code)}`)}
        />
      </div>
    </div>
  );
};

export default RecordsPage;
