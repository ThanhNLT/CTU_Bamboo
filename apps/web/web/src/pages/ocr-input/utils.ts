// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ConfidenceLevel, FieldKey, FormValues, OcrField } from "./types";

export const PAPER_W = 320;
export const PAPER_H = 350;

export const levelOf = (c: number): ConfidenceLevel => (c >= 0.8 ? "high" : c >= 0.5 ? "review" : "manual");

export const LEVEL_STYLE: Record<ConfidenceLevel, { box: string; dot: string; tag: string; note: string }> = {
  high: { box: "border-bamboo-500", dot: "bg-bamboo-500", tag: "bg-bamboo-50 text-bamboo-800", note: "" },
  review: {
    box: "border-yellow-500 bg-yellow-50/40",
    dot: "bg-yellow-500",
    tag: "bg-yellow-50 text-amber-800",
    note: "cần xem",
  },
  manual: { box: "border-red-500 bg-red-50/40", dot: "bg-red-500", tag: "bg-red-50 text-red-700", note: "nhập tay" },
};

export const formatConfidence = (c: number) =>
  c.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const initialValues = (fields: OcrField[], recordType: string): FormValues => {
  const v = { recordType } as FormValues;
  for (const f of fields) v[f.key] = f.value;
  return v;
};

export const pendingReview = (fields: OcrField[], reviewed: Set<FieldKey>) =>
  fields.filter((f) => levelOf(f.confidence) !== "high" && !reviewed.has(f.key));

const DATE = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/;

export const validate = (v: FormValues): Partial<Record<FieldKey, string>> => {
  const e: Partial<Record<FieldKey, string>> = {};
  if (!v.docNo.trim()) e.docNo = "Nhập số phiếu";
  if (!DATE.test(v.date.trim())) e.date = "Ngày dạng dd/mm/yyyy";
  if (!v.unit.trim()) e.unit = "Nhập đơn vị";
  if (!v.device.trim()) e.device = "Nhập thiết bị";
  if (v.description.trim().length < 5) e.description = "Mô tả ít nhất 5 ký tự";
  if (!v.requester.trim()) e.requester = "Chữ viết tay khó đọc – vui lòng nhập";
  return e;
};

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
