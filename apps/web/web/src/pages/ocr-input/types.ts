// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
export type FieldKey = "docNo" | "date" | "unit" | "device" | "priority" | "description" | "requester" | "signature";

/** Khung nhận diện trên trang giấy (px, theo khổ giấy gốc 320 × 350 trước khi phóng to). */
export type BBox = { x: number; y: number; w: number; h: number };

export type OcrField = {
  key: FieldKey;
  label: string;
  /** Chữ OCR đọc được trên giấy (hiển thị trên bản xem trước). */
  raw: string;
  /** Giá trị đề xuất đưa vào form ("" = không đọc được, phải nhập tay). */
  value: string;
  confidence: number;
  bbox: BBox;
};

/** Mức tin cậy: cao (≥ 0,8) · cần xem (0,5–0,8) · nhập tay (< 0,5). */
export type ConfidenceLevel = "high" | "review" | "manual";

export type StepState = "done" | "active" | "running" | "pending";

export type Step = { key: string; title: string; sub: string; state: StepState };

export type Phase = "uploading" | "scanning" | "extracting" | "review" | "created";

export type SourceDoc =
  | { kind: "sample"; name: string; sizeLabel: string; pages: number }
  | { kind: "upload"; name: string; sizeLabel: string; pages: number; url: string };

export type ImportRecord = { id: string; file: string; template: string; at: string; result: string; to?: string };

export type FormValues = Record<FieldKey, string> & { recordType: string };
