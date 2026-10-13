// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Phả hệ dữ liệu (Dữ liệu số): sơ đồ 5 tầng Nguồn → Luồng sự kiện → Hồ dữ liệu → Phục vụ → Tiêu thụ (trái ~70%)
// và chi tiết nút đang chọn với kiểm tra chất lượng Soda (phải ~30%). Trạng thái lỗi / bị ảnh hưởng tự lan theo đồ thị.
// Mở thẳng một tài sản: /d/lineage?asset=mart.approval_daily. Dữ liệu minh họa ở ./mock.
import { App } from "antd";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { DataLineageHeader } from "./components/DataLineageHeader";
import { DataLineageToolbar } from "./components/DataLineageToolbar";
import { LineageGraphMock } from "./components/LineageGraphMock";
import { NodeQualityPanel } from "./components/NodeQualityPanel";
import { QualityAlertBanner } from "./components/QualityAlertBanner";
import { RecentRunsTable } from "./components/RecentRunsTable";
import { ReportIncidentModal } from "./components/ReportIncidentModal";
import {
  computeStatuses,
  failedChecks,
  failureSummaries,
  matchesQuery,
  openMetadataUrl,
  reach,
  scopeOf,
} from "./graph";
import { DEFAULT_NODE_ID, LINEAGE_EDGES, LINEAGE_NODES, LINEAGE_UPDATED_AT, RECENT_RUNS } from "./mock";
import type { Direction, LineageNode } from "./types";

const STATUSES = computeStatuses(LINEAGE_NODES, LINEAGE_EDGES);
const FAILURES = failureSummaries(LINEAGE_NODES, LINEAGE_EDGES);
const BY_ID = new Map(LINEAGE_NODES.map((n) => [n.id, n]));
const DEFAULT_NODE = BY_ID.get(DEFAULT_NODE_ID) as LineageNode;
const isNode = (n: LineageNode | undefined): n is LineageNode => n != null;

/** `?asset=` nhận id nút hoặc tên đầy đủ (fqn), ví dụ mart.approval_daily. */
const nodeFromParam = (asset: string | null) =>
  asset ? LINEAGE_NODES.find((n) => n.id === asset || n.fqn.toLowerCase() === asset.toLowerCase())?.id : undefined;

export const DataLineagePage = () => {
  const { message } = App.useApp();
  const [params] = useSearchParams();
  const asset = params.get("asset");

  const [selectedId, setSelectedId] = useState(() => nodeFromParam(asset) ?? DEFAULT_NODE_ID);
  const [direction, setDirection] = useState<Direction>("both");
  const [depth, setDepth] = useState(3);
  const [columnMode, setColumnMode] = useState(false);
  const [query, setQuery] = useState("");
  const [reporting, setReporting] = useState(false);
  const [notified, setNotified] = useState<Set<string>>(() => new Set());

  // Đang ở trang mà ?asset= đổi (vd. từ Dịch vụ dữ liệu) → chọn lại theo URL.
  const [seenAsset, setSeenAsset] = useState(asset);
  if (seenAsset !== asset) {
    setSeenAsset(asset);
    const id = nodeFromParam(asset);
    if (id) setSelectedId(id);
  }

  const node = BY_ID.get(selectedId) ?? DEFAULT_NODE;
  const status = STATUSES.get(node.id) ?? "healthy";

  const inScope = useMemo(() => scopeOf(LINEAGE_EDGES, node.id, direction, depth), [node.id, direction, depth]);
  const matches = useMemo(() => LINEAGE_NODES.filter((n) => query.trim() && matchesQuery(n, query)), [query]);

  // Tác động phía sau (mọi bậc) và nguồn lỗi phía trước gây "Bị ảnh hưởng".
  const impacts = useMemo(
    () => [...reach(LINEAGE_EDGES, node.id, "down").keys()].map((id) => BY_ID.get(id)).filter(isNode),
    [node.id],
  );
  const causes = useMemo(
    () =>
      status === "affected"
        ? [...reach(LINEAGE_EDGES, node.id, "up").keys()]
            .map((id) => BY_ID.get(id))
            .filter(isNode)
            .filter((n) => STATUSES.get(n.id) === "failed")
        : [],
    [node.id, status],
  );

  const select = (id: string) => setSelectedId(id);

  const viewChecks = (id: string) => {
    setSelectedId(id);
    setQuery("");
    // Đợi panel vẽ lại rồi cuộn tới khối kiểm tra.
    window.requestAnimationFrame(() =>
      document.getElementById("lineage-checks")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  const notifyOwner = () => {
    const fails = failedChecks(node).length;
    setNotified((prev) => new Set(prev).add(node.id));
    message.success(
      fails
        ? `Đã báo ${node.owner} về ${fails} kiểm tra lỗi trên ${node.fqn}.`
        : `Đã gửi thông báo tới ${node.owner} về ${node.fqn}.`,
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <DataLineageHeader openMetadataHref={openMetadataUrl(node.fqn)} onReport={() => setReporting(true)} />

      <QualityAlertBanner failures={FAILURES} onView={viewChecks} />

      <DataLineageToolbar
        query={query}
        onQueryChange={setQuery}
        onSubmitQuery={() => {
          if (matches[0]) setSelectedId(matches[0].id);
        }}
        matchCount={matches.length}
        depth={depth}
        onDepthChange={setDepth}
        columnMode={columnMode}
        onColumnModeChange={setColumnMode}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(270px,3fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <LineageGraphMock
            focus={node}
            nodes={LINEAGE_NODES}
            edges={LINEAGE_EDGES}
            statuses={STATUSES}
            inScope={inScope}
            matches={(n) => matchesQuery(n, query)}
            query={query}
            selectedId={node.id}
            direction={direction}
            columnMode={columnMode}
            updatedAt={LINEAGE_UPDATED_AT}
            onSelect={select}
            onDirectionChange={setDirection}
          />
          <RecentRunsTable runs={RECENT_RUNS} selectedNodeId={node.id} onSelectNode={select} />
        </div>

        <NodeQualityPanel
          key={node.id}
          node={node}
          status={status}
          causes={causes}
          impacts={impacts}
          statuses={STATUSES}
          notified={notified.has(node.id)}
          onNotify={notifyOwner}
          onSelect={select}
        />
      </div>

      <ReportIncidentModal
        open={reporting}
        nodes={LINEAGE_NODES}
        defaultId={node.id}
        onCancel={() => setReporting(false)}
        onSubmit={(v) => {
          const target = BY_ID.get(v.nodeId);
          setReporting(false);
          message.success(
            `Đã tạo sự cố dữ liệu DQ-2026-0118 cho ${target?.fqn ?? v.nodeId} · đã báo ${target?.owner ?? "chủ sở hữu"}.`,
          );
        }}
      />
    </div>
  );
};

export default DataLineagePage;
