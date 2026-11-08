export type Seal = {
  attachmentId: string;
  entityType: string;
  entityId: string;
  code: string;
  version: number;
  title: string;
  fileName: string;
  unit: string;
  sealedAt: string;
  channel: string;
  block: number | null;
  txId: string | null;
  sha256: string;
  lastResult: "match" | "mismatch" | "not_found" | null;
  lastCheckedAt: string | null;
};

export type VerifyVia = "code" | "file";

export type VerifyResult =
  | { kind: "match"; seal: Seal; via: VerifyVia; checkedAt: string; fileName?: string }
  | {
      kind: "mismatch";
      seal: Seal;
      actualSha256: string | null;
      problem?: string;
      via: VerifyVia;
      checkedAt: string;
      fileName?: string;
    }
  | { kind: "not_found"; query: string; via: VerifyVia; checkedAt: string; sha256?: string; fileName?: string };

export type LedgerOverview = {
  channel: string;
  sealed: number;
  sealedThisWeek: number;
  archived: number;
  checkedToday: number;
  matchedToday: number;
  mismatchedToday: number;
  mismatch30d: number;
  chainReader: boolean;
  recent: Seal[];
};

export type ArchiveDoc = {
  id: string;
  code: string;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  unit: string;
  restricted: boolean;
  archivedYear: number;
};

export type AccessLog = { id: string; docTitle: string; fileName: string; viewer: string; at: string };

export type ArchiveView = {
  attachmentId: string;
  title: string;
  fileName: string;
  contentType: string;
  viewer: string;
  openedAt: string;
  url: string;
};

export type LedgerTab = "verify" | "reading";
export type VerifyMode = "code" | "file";
