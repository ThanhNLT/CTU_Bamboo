// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App, Spin } from "antd";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { reportIssue, useLineage, type LineageData } from "./api";
import { DataLineageHeader } from "./components/DataLineageHeader";
import { DataLineageToolbar } from "./components/DataLineageToolbar";
import { LineageGraphMock } from "./components/LineageGraphMock";
import { NodeQualityPanel } from "./components/NodeQualityPanel";
import { QualityAlertBanner } from "./components/QualityAlertBanner";
import { RecentRunsTable } from "./components/RecentRunsTable";
import { ReportIncidentModal } from "./components/ReportIncidentModal";
import { computeStatuses, failedChecks, failureSummaries, matchesQuery, reach, scopeOf } from "./graph";
import type { Direction, LineageNode } from "./types";
import { tr, trf } from "../../i18n";

const PREFERRED = "gold-approval-daily";
const SEVERITY = { wrong: "high", missing: "high", late: "medium", other: "low" } as const;
const KIND_LABEL: Record<string, string> = {
  wrong: tr("Dữ liệu sai"),
  missing: tr("Thiếu / rỗng dữ liệu"),
  late: tr("Cập nhật trễ"),
  other: tr("Khác"),
};

const isNode = (n: LineageNode | undefined): n is LineageNode => n != null;

const nodeFromParam = (nodes: LineageNode[], asset: string | null) =>
  asset ? nodes.find((n) => n.id === asset || n.fqn.toLowerCase() === asset.toLowerCase())?.id : undefined;

export const DataLineagePage = () => {
  const lineage = useLineage();
  if (lineage.error)
    return <Alert type="error" showIcon message={tr("Không tải được phả hệ")} description={lineage.error} />;
  if (!lineage.data) return <Spin className="m-10" />;
  if (lineage.data.nodes.length === 0)
    return <Alert type="info" showIcon message={tr("Chưa có dữ liệu phả hệ (chạy python -m app.demo_load).")} />;
  return <LineageView data={lineage.data} />;
};

const LineageView = ({ data }: { data: LineageData }) => {
  const { message } = App.useApp();
  const [params] = useSearchParams();
  const asset = params.get("asset");
  const { nodes, edges, runs, updatedAt } = data;
  const statuses = useMemo(() => computeStatuses(nodes, edges), [nodes, edges]);
  const failures = useMemo(() => failureSummaries(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const defaultNodeId = byId.has(PREFERRED) ? PREFERRED : nodes[0].id;
  const defaultNode = byId.get(defaultNodeId) as LineageNode;

  const [selectedId, setSelectedId] = useState(() => nodeFromParam(nodes, asset) ?? defaultNodeId);
  const [direction, setDirection] = useState<Direction>("both");
  const [depth, setDepth] = useState(3);
  const [columnMode, setColumnMode] = useState(false);
  const [query, setQuery] = useState("");
  const [reporting, setReporting] = useState(false);
  const [notified, setNotified] = useState<Set<string>>(() => new Set());

  const [seenAsset, setSeenAsset] = useState(asset);
  if (seenAsset !== asset) {
    setSeenAsset(asset);
    const id = nodeFromParam(nodes, asset);
    if (id) setSelectedId(id);
  }

  const node = byId.get(selectedId) ?? defaultNode;
  const status = statuses.get(node.id) ?? "healthy";

  const inScope = useMemo(() => scopeOf(edges, node.id, direction, depth), [edges, node.id, direction, depth]);
  const matches = useMemo(() => nodes.filter((n) => query.trim() && matchesQuery(n, query)), [nodes, query]);

  const impacts = useMemo(
    () => [...reach(edges, node.id, "down").keys()].map((id) => byId.get(id)).filter(isNode),
    [edges, byId, node.id],
  );
  const causes = useMemo(
    () =>
      status === "affected"
        ? [...reach(edges, node.id, "up").keys()]
            .map((id) => byId.get(id))
            .filter(isNode)
            .filter((n) => statuses.get(n.id) === "failed")
        : [],
    [edges, byId, statuses, node.id, status],
  );

  const select = (id: string) => setSelectedId(id);

  const viewChecks = (id: string) => {
    setSelectedId(id);
    setQuery("");
    window.requestAnimationFrame(() =>
      document.getElementById("lineage-checks")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  const notifyOwner = async () => {
    const fails = failedChecks(node);
    try {
      const code = await reportIssue(
        node.id,
        fails.length ? "high" : "medium",
        fails.length
          ? trf("Báo {0}: {1}", [node.owner, fails.map((c) => `${c.rule} — ${c.detail}`).join("; ")])
          : trf("Báo {0} kiểm tra {1}.", [node.owner, node.fqn]),
      );
      setNotified((prev) => new Set(prev).add(node.id));
      message.success(
        fails.length
          ? trf("Đã báo {0} về {1} kiểm tra lỗi trên {2} ({3}).", [node.owner, fails.length, node.fqn, code])
          : trf("Đã gửi thông báo tới {0} về {1} ({2}).", [node.owner, node.fqn, code]),
      );
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <DataLineageHeader onReport={() => setReporting(true)} />

      <QualityAlertBanner failures={failures} onView={viewChecks} />

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
            nodes={nodes}
            edges={edges}
            statuses={statuses}
            inScope={inScope}
            matches={(n) => matchesQuery(n, query)}
            query={query}
            selectedId={node.id}
            direction={direction}
            columnMode={columnMode}
            updatedAt={updatedAt}
            onSelect={select}
            onDirectionChange={setDirection}
          />
          <RecentRunsTable runs={runs} selectedNodeId={node.id} onSelectNode={select} />
        </div>

        <NodeQualityPanel
          key={node.id}
          node={node}
          status={status}
          causes={causes}
          impacts={impacts}
          statuses={statuses}
          notified={notified.has(node.id)}
          onNotify={() => void notifyOwner()}
          onSelect={select}
        />
      </div>

      <ReportIncidentModal
        open={reporting}
        nodes={nodes}
        defaultId={node.id}
        onCancel={() => setReporting(false)}
        onSubmit={async (v) => {
          const target = byId.get(v.nodeId);
          try {
            const kind = v.kind as keyof typeof SEVERITY;
            const code = await reportIssue(
              v.nodeId,
              SEVERITY[kind] ?? "low",
              `[${KIND_LABEL[v.kind] ?? v.kind}] ${v.description.trim()}`,
            );
            setReporting(false);
            message.success(
              trf("Đã tạo sự cố dữ liệu {0} cho {1} · đã báo {2}.", [
                code,
                target?.fqn ?? v.nodeId,
                target?.owner ?? tr("chủ sở hữu"),
              ]),
            );
          } catch (e) {
            message.error((e as Error).message);
          }
        }}
      />
    </div>
  );
};

export default DataLineagePage;
