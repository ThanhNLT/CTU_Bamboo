export type DomainFilter = "all" | string;

export type PiiLevel = "none" | "masked" | "raw";

export type StorageTier = "hot" | "warm" | "cold";

export type ColumnDef = { name: string; type: string; description: string; pii?: boolean };

export type QualityCheck = { name: string; passed: boolean; detail: string };

export type Dataset = {
  id: string;
  table: string;
  title: string;
  description: string;
  domain: string;
  owner: string;
  refresh: string;
  rows?: number;
  access: string;
  updatedLabel: string;
  certified: boolean;
  pii: PiiLevel;
  piiNote?: string;
  tier: StorageTier;
  columns: ColumnDef[];
  checks: QualityCheck[];
  upstream: string[];
  downstream: string[];
  graphql: string;
  sql: string;
};

export type DatasetPreview = {
  totalRows: number;
  rows: Array<Record<string, unknown>>;
  masked: string[];
};

export type DetailTab = "schema" | "sample" | "usage" | "quality" | "lineage";
