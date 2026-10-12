// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

/** Một bản niêm phong trên sổ cái (Hyperledger Fabric): mã băm SHA-256 của một phiên bản hồ sơ. */
export type Seal = {
  code: string;
  version: number;
  title: string;
  /** "03/10/2026 14:22" */
  sealedAt: string;
  /** Kênh Fabric, ví dụ "semicon". */
  channel: string;
  block: number;
  txId: string;
  sha256: string;
  /** Mã băm của tệp đang nằm trong kho lưu trữ. Khác `sha256` = tệp đã bị thay đổi sau khi niêm phong. */
  storedSha256?: string;
  /** Ghi chú xử lý khi có sai lệch (biên bản). */
  resolution?: string;
};

export type VerifyVia = "code" | "file";

export type VerifyResult =
  | { kind: "match"; seal: Seal; via: VerifyVia; checkedAt: string; fileName?: string }
  | { kind: "mismatch"; seal: Seal; actualSha256: string; via: VerifyVia; checkedAt: string; fileName?: string }
  | { kind: "not_found"; query: string; via: VerifyVia; checkedAt: string; sha256?: string; fileName?: string };

export type SealLogRow = { code: string; version: number; time: string; result: "match" | "mismatch" };

export type ArchiveDoc = {
  id: string;
  code: string;
  title: string;
  archivedYear: number;
  pages: number;
  unit: string;
  access: "Nội bộ" | "Hạn chế";
};

export type AccessLog = { id: string; docTitle: string; viewer: string; at: string };

export type LedgerTab = "verify" | "reading";
export type VerifyMode = "code" | "file";
