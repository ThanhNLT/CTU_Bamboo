// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { fold } from "../../utils/text";
import type { Direction, Layer, LineageEdge, LineageNode, NodeStatus, QualityCheck } from "./types";
import { tr } from "../../i18n";

export const LAYERS: Array<{ key: Layer; label: string }> = [
  { key: "source", label: tr("Nguồn") },
  { key: "stream", label: tr("Luồng sự kiện") },
  { key: "lake", label: tr("Hồ dữ liệu") },
  { key: "serving", label: tr("Phục vụ") },
  { key: "consumer", label: tr("Tiêu thụ") },
];

export const STATUS_LABEL: Record<NodeStatus, string> = {
  healthy: tr("Khỏe"),
  failed: tr("Kiểm tra lỗi"),
  affected: tr("Bị ảnh hưởng"),
};

const adjacency = (edges: LineageEdge[], dir: "down" | "up") => {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = dir === "down" ? [e.from, e.to] : [e.to, e.from];
    m.set(a, [...(m.get(a) ?? []), b]);
  }
  return m;
};

export const reach = (edges: LineageEdge[], start: string, dir: "down" | "up", maxDepth = Infinity) => {
  const adj = adjacency(edges, dir);
  const dist = new Map<string, number>();
  let frontier = [start];
  for (let d = 1; frontier.length && d <= maxDepth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (n === start || dist.has(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
};

export const failedChecks = (n: LineageNode): QualityCheck[] => n.checks.filter((c) => !c.passed);

export const computeStatuses = (nodes: LineageNode[], edges: LineageEdge[]) => {
  const status = new Map<string, NodeStatus>(nodes.map((n) => [n.id, "healthy"]));
  for (const n of nodes) {
    if (failedChecks(n).length === 0) continue;
    status.set(n.id, "failed");
    for (const id of reach(edges, n.id, "down").keys()) {
      if (status.get(id) !== "failed") status.set(id, "affected");
    }
  }
  return status;
};

export const componentOf = (edges: LineageEdge[], start: string) => {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const e of edges) {
      const other = e.from === id ? e.to : e.to === id ? e.from : undefined;
      if (other && !seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return seen;
};

export const scopeOf = (edges: LineageEdge[], focus: string, direction: Direction, depth: number) => {
  const inScope = new Set([focus]);
  if (direction !== "downstream") for (const id of reach(edges, focus, "up", depth).keys()) inScope.add(id);
  if (direction !== "upstream") for (const id of reach(edges, focus, "down", depth).keys()) inScope.add(id);
  const component = componentOf(edges, focus);
  return (id: string) => inScope.has(id) || !component.has(id);
};

export const matchesQuery = (n: LineageNode, query: string) => {
  const q = fold(query.trim());
  if (!q) return true;
  const checks = n.checks.map((c) => c.rule).join(" ");
  return fold(
    `${n.tech} ${n.name} ${n.fqn} ${n.title} ${(n.columns ?? []).join(" ")} ${checks} ${n.usedBy ?? ""}`,
  ).includes(q);
};

export const failureSummaries = (nodes: LineageNode[], edges: LineageEdge[]) =>
  nodes.flatMap((n) => failedChecks(n).map((check) => ({ node: n, check, impacted: reach(edges, n.id, "down").size })));

export const NODE_W = 17.2;
export const GAP = 3.5;
export const colLeft = (layer: Layer) => LAYERS.findIndex((l) => l.key === layer) * (NODE_W + GAP);

export const graphMetrics = (columnMode: boolean) => {
  const nodeH = columnMode ? 62 : 46;
  const rowH = columnMode ? 80 : 64;
  return { nodeH, rowH, top: (row: number) => row * rowH };
};

export const edgePath = (from: LineageNode, to: LineageNode, columnMode: boolean) => {
  const { nodeH, top } = graphMetrics(columnMode);
  const x1 = (colLeft(from.layer) + NODE_W) * 10;
  const x2 = colLeft(to.layer) * 10;
  const y1 = top(from.row) + nodeH / 2;
  const y2 = top(to.row) + nodeH / 2;
  if (Math.abs(y1 - y2) < 0.5) return `M ${x1} ${y1} H ${x2}`;
  const bendStart = x2 - GAP * 10;
  const xm = bendStart + (GAP * 10) / 2;
  return `M ${x1} ${y1} H ${bendStart} C ${xm} ${y1}, ${xm} ${y2}, ${x2} ${y2}`;
};

export const graphHeight = (nodes: LineageNode[], columnMode: boolean) => {
  const { nodeH, top } = graphMetrics(columnMode);
  return Math.max(...nodes.map((n) => top(n.row))) + nodeH + 2;
};
