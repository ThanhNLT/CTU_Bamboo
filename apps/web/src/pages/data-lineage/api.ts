/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";
import { useLiveTopics } from "../../live/useLive";
import { LAYERS } from "./graph";
import type { LineageEdge, LineageNode, RunResult, RunRow } from "./types";
import { tr, trf } from "../../i18n";

export type LineageOrigin = "auto" | "demo";

const LINEAGE = `query Lineage($o: String!) {
  meta_lineage_node(where: {origin: {_eq: $o}}) { id layer tech name fqn title owner used_by app_link
    quality_checks(order_by: {checked_at: desc}) { rule name passed detail checked_at } }
  meta_lineage_edge(where: {origin: {_eq: $o}}) { from_node to_node columns }
  meta_pipeline_run(where: {node: {origin: {_eq: $o}}}, order_by: {started_at: desc}, limit: 12) {
    id task engine node_id started_at duration_s result }
  auto: meta_lineage_node_aggregate(where: {origin: {_eq: "auto"}}) { aggregate { count } }
  demo: meta_lineage_node_aggregate(where: {origin: {_eq: "demo"}}) { aggregate { count } }
}`;

export const refreshLineage = async () => {
  const { lineage_refresh } = await request<{
    lineage_refresh: { nodes: number; edges: number; checks: number; failed: number; note: string | null };
  }>(`mutation { lineage_refresh { nodes edges checks failed note } }`);
  return lineage_refresh;
};

type NodeRow = {
  id: string;
  layer: LineageNode["layer"];
  tech: string;
  name: string;
  fqn: string;
  title: string;
  owner: string;
  used_by: string | null;
  app_link: string | null;
  quality_checks: { rule: string; name: string; passed: boolean; detail: string; checked_at: string }[];
};
type EdgeRow = { from_node: string; to_node: string; columns: string[] };
type RunRowDb = {
  id: string;
  task: string;
  engine: string;
  node_id: string;
  started_at: string;
  duration_s: number;
  result: RunResult;
};

export type LineageData = {
  nodes: LineageNode[];
  edges: LineageEdge[];
  runs: RunRow[];
  updatedAt: string;
  counts: Record<LineageOrigin, number>;
};

const HHMM = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const hhmm = (iso: string) => HHMM.format(new Date(iso));
const duration = (s: number) =>
  s >= 60 ? trf("{0} phút {1} giây", [Math.floor(s / 60), s % 60]) : trf("{0} giây", [s]);
const TECH_MONO = new Set(["PostgreSQL", "Kafka", "Iceberg", "Trino"]);

const layout = (rows: NodeRow[], edges: EdgeRow[]) => {
  const row = new Map<string, number>();
  for (const { key } of LAYERS) {
    const inLayer = rows.filter((n) => n.layer === key);
    const score = (n: NodeRow) => {
      const prev = edges.filter((e) => e.to_node === n.id && row.has(e.from_node)).map((e) => row.get(e.from_node)!);
      return prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : Number.MAX_SAFE_INTEGER;
    };
    inLayer
      .map((n, i) => ({ n, s: score(n), i }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .forEach(({ n }, i) => row.set(n.id, i));
  }
  return row;
};

const toData = (
  nodes: NodeRow[],
  edges: EdgeRow[],
  runs: RunRowDb[],
  counts: Record<LineageOrigin, number>,
): LineageData => {
  const row = layout(nodes, edges);
  const colsOf = (id: string) => [
    ...new Set([
      ...edges.filter((e) => e.to_node === id).flatMap((e) => e.columns.map((c) => c.split("→")[1]?.trim() ?? c)),
      ...edges.filter((e) => e.from_node === id).flatMap((e) => e.columns.map((c) => c.split("→")[0].trim())),
    ]),
  ];
  const latest = nodes
    .flatMap((n) => n.quality_checks.map((c) => c.checked_at))
    .sort()
    .at(-1);
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      layer: n.layer,
      row: row.get(n.id) ?? 0,
      tech: n.tech,
      name: n.name,
      mono: TECH_MONO.has(n.tech),
      fqn: n.fqn,
      title: n.title,
      owner: n.owner,
      updated: n.quality_checks[0] ? hhmm(n.quality_checks[0].checked_at) : "—",
      checks: n.quality_checks.map((c) => ({
        rule: c.rule,
        name: c.name,
        passed: c.passed,
        detail: c.detail,
        failedAt: c.passed ? undefined : hhmm(c.checked_at),
      })),
      columns: colsOf(n.id),
      usedBy: n.used_by ?? undefined,
      appLink: n.app_link ?? undefined,
      datasetId: n.name.startsWith("silver.") ? n.name.slice("silver.".length) : undefined,
    })),
    edges: edges.map((e) => ({ from: e.from_node, to: e.to_node })),
    runs: runs.map((r) => ({
      id: r.id,
      task: r.task,
      engine: r.engine,
      start: hhmm(r.started_at),
      duration: r.result === "running" ? tr("đang chạy") : duration(r.duration_s),
      result: r.result,
      nodeId: r.node_id,
    })),
    updatedAt: latest ? hhmm(latest) : "—",
    counts,
  };
};

type Count = { aggregate: { count: number } };

export const useLineage = (origin: LineageOrigin) => {
  const [state, setState] = useState<{ data?: LineageData; error?: string; loading: boolean }>({ loading: true });
  const load = useCallback(async () => {
    try {
      const r = await request<{
        meta_lineage_node: NodeRow[];
        meta_lineage_edge: EdgeRow[];
        meta_pipeline_run: RunRowDb[];
        auto: Count;
        demo: Count;
      }>(LINEAGE, { o: origin });
      setState({
        data: toData(r.meta_lineage_node, r.meta_lineage_edge, r.meta_pipeline_run, {
          auto: r.auto.aggregate.count,
          demo: r.demo.aggregate.count,
        }),
        loading: false,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [origin]);
  useEffect(() => {
    void load();
  }, [load]);
  const live = useLiveTopics(["lineage"], load);
  return { ...state, reload: load, live };
};

export const reportIssue = async (nodeId: string, severity: "low" | "medium" | "high", description: string) => {
  const r = await request<{ insert_meta_data_issue_one: { id: string } }>(
    `mutation Issue($o: meta_data_issue_insert_input!) { insert_meta_data_issue_one(object: $o) { id } }`,
    { o: { node_id: nodeId, severity, description } },
  );
  return `DQ-${r.insert_meta_data_issue_one.id.slice(0, 8).toUpperCase()}`;
};
