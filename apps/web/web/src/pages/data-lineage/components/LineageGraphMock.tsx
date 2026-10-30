// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import { LAYERS, NODE_W, STATUS_LABEL, colLeft, edgePath, graphHeight, graphMetrics } from "../graph";
import type { Direction, LineageEdge, LineageNode, NodeStatus } from "../types";

const NODE_CLASS: Record<NodeStatus, string> = {
  healthy: "border border-line bg-surface",
  failed: "border-[1.5px] border-red-500 bg-red-50",
  affected: "border border-dashed border-yellow-500 bg-yellow-50",
};
const SELECTED_RING: Record<NodeStatus, string> = {
  healthy: "ring-3 ring-bamboo-200",
  failed: "ring-3 ring-red-200",
  affected: "ring-3 ring-yellow-200",
};
const DOT_CLASS: Record<NodeStatus, string> = {
  healthy: "bg-bamboo-500",
  failed: "bg-red-500",
  affected: "bg-yellow-500",
};
const TECH_CLASS: Record<NodeStatus, string> = {
  healthy: "text-muted",
  failed: "text-red-700",
  affected: "text-amber-700",
};

const EDGE_OK = "#5f8a69";
const EDGE_BAD = "#ef4444";

const DIRECTIONS: Array<{ key: Direction; label: string }> = [
  { key: "upstream", label: "Phía trước" },
  { key: "both", label: "Cả hai" },
  { key: "downstream", label: "Phía sau" },
];

const DirectionToggle = ({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) => (
  <div role="group" aria-label="Hướng phả hệ" className="inline-flex shrink-0 gap-0.5 rounded-ui bg-black/[0.045] p-1">
    {DIRECTIONS.map(({ key, label }) => {
      const active = key === value;
      return (
        <button
          key={key}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(key)}
          className={cn(
            "h-7 rounded-ui px-3 text-[12px] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
            active ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
          )}
        >
          {label}
        </button>
      );
    })}
  </div>
);

const LegendDot = ({ className, label }: { className: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cn("h-2 w-2 rounded-ui", className)} aria-hidden />
    {label}
  </span>
);

const NodeCard = ({
  node,
  status,
  selected,
  dimmed,
  matched,
  columnMode,
  top,
  height,
  onSelect,
}: {
  node: LineageNode;
  status: NodeStatus;
  selected: boolean;
  dimmed: boolean;
  matched: boolean;
  columnMode: boolean;
  top: number;
  height: number;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    aria-label={`${node.tech} ${node.name} · ${STATUS_LABEL[status]}`}
    title={`${node.fqn} · ${STATUS_LABEL[status]}`}
    style={{ left: `${colLeft(node.layer)}%`, width: `${NODE_W}%`, top, height }}
    className={cn(
      "absolute flex flex-col justify-center rounded-ui px-2.5 text-left transition-[opacity,box-shadow]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
      NODE_CLASS[status],
      selected ? `${SELECTED_RING[status]} shadow-card` : matched ? "ring-2 ring-bamboo-400" : "hover:shadow-card",
      dimmed && "opacity-35",
    )}
  >
    <span className={cn("absolute right-2 top-2 h-1.5 w-1.5 rounded-ui", DOT_CLASS[status])} aria-hidden />
    <span className={cn("block truncate pr-3 text-[10.5px] leading-tight", TECH_CLASS[status])}>{node.tech}</span>
    <span
      className={cn(
        "mt-0.5 block truncate text-[12px] leading-tight text-ink",
        node.mono ? "font-mono" : "font-semibold",
      )}
    >
      {node.name}
    </span>
    {columnMode && node.columns?.length ? (
      <span className="mt-1 block truncate font-mono text-[10.5px] leading-tight text-bamboo-700">
        {node.columns.join(", ")}
      </span>
    ) : null}
  </button>
);

export const LineageGraphMock = ({
  focus,
  nodes,
  edges,
  statuses,
  inScope,
  matches,
  query,
  selectedId,
  direction,
  columnMode,
  updatedAt,
  onSelect,
  onDirectionChange,
}: {
  focus: LineageNode;
  nodes: LineageNode[];
  edges: LineageEdge[];
  statuses: Map<string, NodeStatus>;
  inScope: (id: string) => boolean;
  matches: (n: LineageNode) => boolean;
  query: string;
  selectedId: string;
  direction: Direction;
  columnMode: boolean;
  updatedAt: string;
  onSelect: (id: string) => void;
  onDirectionChange: (d: Direction) => void;
}) => {
  const { nodeH, top } = graphMetrics(columnMode);
  const height = graphHeight(nodes, columnMode);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const searching = query.trim().length > 0;
  const visible = (n: LineageNode) => inScope(n.id) && (!searching || matches(n));

  return (
    <section
      className="rounded-2xl border border-line bg-surface p-5 shadow-card"
      aria-label={`Phả hệ của ${focus.fqn}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-[15px] font-semibold text-ink">Phả hệ của {focus.fqn}</h2>
        <DirectionToggle value={direction} onChange={onDirectionChange} />
      </div>

      <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
        <div className="relative min-w-[680px]">
          <div className="relative h-5">
            {LAYERS.map((l) => (
              <span
                key={l.key}
                style={{ left: `${colLeft(l.key)}%`, width: `${NODE_W}%` }}
                className="absolute top-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                {l.label}
              </span>
            ))}
          </div>

          <div className="relative mt-3" style={{ height }}>
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 1000 ${height}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              {edges.map((e) => {
                const from = byId.get(e.from);
                const to = byId.get(e.to);
                if (!from || !to) return null;
                const bad = statuses.get(e.from) !== "healthy";
                const lit = visible(from) && visible(to);
                return (
                  <path
                    key={`${e.from}>${e.to}`}
                    d={edgePath(from, to, columnMode)}
                    fill="none"
                    stroke={bad ? EDGE_BAD : EDGE_OK}
                    strokeWidth={1.5}
                    strokeDasharray={bad ? "5 4" : undefined}
                    strokeOpacity={lit ? 0.9 : 0.2}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {nodes.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                status={statuses.get(n.id) ?? "healthy"}
                selected={n.id === selectedId}
                dimmed={!visible(n)}
                matched={searching && matches(n)}
                columnMode={columnMode}
                top={top(n.row)}
                height={nodeH}
                onSelect={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[11.5px] text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendDot className="bg-bamboo-500" label="Khỏe" />
          <LegendDot className="bg-red-500" label="Kiểm tra lỗi" />
          <LegendDot className="bg-yellow-500" label="Bị ảnh hưởng" />
        </div>
        <span>Cập nhật {updatedAt}</span>
      </div>
    </section>
  );
};
