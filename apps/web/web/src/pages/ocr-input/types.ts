// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type FieldKey = "docNo" | "date" | "unit" | "device" | "priority" | "description" | "requester" | "signature";

export type BBox = { x: number; y: number; w: number; h: number };

export type OcrField = {
  key: FieldKey;
  label: string;
  raw: string;
  value: string;
  confidence: number;
  bbox: BBox;
};

export type ConfidenceLevel = "high" | "review" | "manual";

export type StepState = "done" | "active" | "running" | "pending";

export type Step = { key: string; title: string; sub: string; state: StepState };

export type Phase = "uploading" | "scanning" | "extracting" | "review" | "created";

export type SourceDoc =
  | { kind: "sample"; name: string; sizeLabel: string; pages: number }
  | { kind: "upload"; name: string; sizeLabel: string; pages: number; url: string };

export type ImportRecord = { id: string; file: string; template: string; at: string; result: string; to?: string };

export type FormValues = Record<FieldKey, string> & { recordType: string };
