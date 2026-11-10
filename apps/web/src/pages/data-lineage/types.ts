export type Layer = "source" | "stream" | "lake" | "serving" | "consumer";

export type Direction = "upstream" | "both" | "downstream";

export type NodeStatus = "healthy" | "failed" | "affected";

export type QualityCheck = {
  rule: string;
  name: string;
  passed: boolean;
  detail: string;
  failedAt?: string;
};

export type LineageNode = {
  id: string;
  layer: Layer;
  row: number;
  tech: string;
  name: string;
  mono: boolean;
  fqn: string;
  title: string;
  owner: string;
  updated: string;
  checks: QualityCheck[];
  columns?: string[];
  usedBy?: string;
  appLink?: string;
  datasetId?: string;
};

export type LineageEdge = { from: string; to: string };

export type RunResult = "success" | "check_failed" | "failed" | "running";

export type RunRow = {
  id: string;
  task: string;
  engine: string;
  start: string;
  duration: string;
  result: RunResult;
  nodeId: string;
};
