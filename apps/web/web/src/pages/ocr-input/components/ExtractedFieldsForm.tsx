// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Checkbox, Select } from "antd";
import { Check, CheckCircle2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { PRIORITIES, RECORD_TYPES } from "../mock";
import type { FieldKey, FormValues, OcrField } from "../types";
import { LEVEL_STYLE, formatConfidence, levelOf } from "../utils";

const fieldId = (k: FieldKey) => `ocr-field-${k}`;

const ConfidenceTag = ({
  field,
  reviewed,
  canConfirm,
  onConfirm,
}: {
  field: OcrField;
  reviewed: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
}) => {
  if (reviewed) {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-bamboo-50 px-2 text-[11px] font-medium text-bamboo-800">
        <Check className="h-3 w-3" aria-hidden />
        Đã kiểm tra
      </span>
    );
  }
  const lv = levelOf(field.confidence);
  const st = LEVEL_STYLE[lv];
  const content = (
    <>
      <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} aria-hidden />
      {formatConfidence(field.confidence)}
      {st.note && ` · ${st.note}`}
    </>
  );
  const cls = cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", st.tag);
  return lv !== "high" && canConfirm ? (
    <button
      type="button"
      onClick={onConfirm}
      title="Bấm để xác nhận bạn đã xem giá trị này"
      className={cn(cls, "hover:brightness-95")}
    >
      {content}
    </button>
  ) : (
    <span className={cls}>{content}</span>
  );
};

const Field = ({
  field,
  label,
  reviewed,
  onConfirm,
  canConfirm = true,
  error,
  children,
  className,
}: {
  field?: OcrField;
  label: string;
  reviewed: boolean;
  onConfirm: () => void;
  canConfirm?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("min-w-0", className)}>
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <label htmlFor={field ? fieldId(field.key) : undefined} className="text-[12.5px] text-body">
        {label}
      </label>
      {field && <ConfidenceTag field={field} reviewed={reviewed} canConfirm={canConfirm} onConfirm={onConfirm} />}
    </div>
    {children}
    {error && (
      <p className="mt-1 text-[11.5px] text-red-600" role="alert">
        {error}
      </p>
    )}
  </div>
);

const inputClass = (invalid: boolean, mono = false) =>
  cn(
    "w-full rounded-xl border px-3 text-ink outline-none transition-colors",
    mono ? "font-mono text-[13px]" : "font-sans text-[13.5px]",
    invalid
      ? "border-red-500 bg-white placeholder:text-red-500 focus:ring-3 focus:ring-red-100"
      : "border-transparent bg-canvas placeholder:text-muted hover:border-line focus:border-bamboo-600 focus:bg-white focus:ring-3 focus:ring-bamboo-100",
  );

export const ExtractedFieldsForm = ({
  fields,
  values,
  reviewed,
  errors,
  pendingCount,
  disabled,
  createdCode,
  onChange,
  onConfirm,
  onFocusField,
  onCreate,
  onRescan,
  onReset,
}: {
  fields: OcrField[];
  values: FormValues;
  reviewed: Set<FieldKey>;
  errors: Partial<Record<FieldKey, string>>;
  pendingCount: number;
  disabled: boolean;
  createdCode?: string;
  onChange: (key: FieldKey | "recordType", value: string) => void;
  onConfirm: (key: FieldKey) => void;
  onFocusField: (key?: FieldKey) => void;
  onCreate: () => void;
  onRescan: () => void;
  onReset: () => void;
}) => {
  const f = (k: FieldKey) => fields.find((x) => x.key === k);
  const common = (k: FieldKey) => ({
    id: fieldId(k),
    value: values[k],
    disabled: disabled || createdCode != null,
    onFocus: () => onFocusField(k),
    onBlur: () => onFocusField(undefined),
    "aria-invalid": errors[k] ? true : undefined,
  });
  const props = (k: FieldKey) => ({
    field: f(k),
    reviewed: reviewed.has(k),
    onConfirm: () => onConfirm(k),
    error: errors[k],
  });
  const requesterEmpty = !values.requester.trim();

  return (
    <section
      aria-label="Trường đã trích xuất"
      className="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Trường đã trích xuất</h2>
        {pendingCount > 0 ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 text-[12px] font-medium text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" aria-hidden />
            {pendingCount} cần xem
          </span>
        ) : (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-bamboo-50 px-2.5 text-[12px] font-medium text-bamboo-800">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Đã kiểm tra hết
          </span>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="ocr-record-type" className="mb-1.5 block text-[12.5px] text-body">
          Loại hồ sơ sẽ tạo
        </label>
        <Select
          id="ocr-record-type"
          value={values.recordType}
          onChange={(v: string) => onChange("recordType", v)}
          options={RECORD_TYPES.map((t) => ({ value: t, label: t }))}
          size="large"
          variant="filled"
          className="w-full"
          disabled={disabled || createdCode != null}
        />
      </div>

      <div
        className={cn(
          "mt-4 grid grid-cols-1 gap-x-4 gap-y-3.5 border-t border-line pt-4 transition-opacity sm:grid-cols-2",
          disabled && "opacity-50",
        )}
        aria-busy={disabled || undefined}
      >
        <Field label="Số phiếu" {...props("docNo")}>
          <input
            {...common("docNo")}
            onChange={(e) => onChange("docNo", e.target.value)}
            className={cn(inputClass(!!errors.docNo, true), "h-10")}
          />
        </Field>
        <Field label="Ngày lập" {...props("date")}>
          <input
            {...common("date")}
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            onChange={(e) => onChange("date", e.target.value)}
            className={cn(inputClass(!!errors.date), "h-10 tabular-nums")}
          />
        </Field>

        <Field label="Đơn vị yêu cầu" className="sm:col-span-2" {...props("unit")}>
          <input
            {...common("unit")}
            onChange={(e) => onChange("unit", e.target.value)}
            className={cn(inputClass(!!errors.unit), "h-10")}
          />
        </Field>

        <Field label="Thiết bị" {...props("device")}>
          <input
            {...common("device")}
            onChange={(e) => onChange("device", e.target.value)}
            className={cn(inputClass(!!errors.device), "h-10")}
          />
        </Field>
        <Field label="Mức ưu tiên" {...props("priority")}>
          <Select
            id={fieldId("priority")}
            value={values.priority}
            onChange={(v: string) => onChange("priority", v)}
            onFocus={() => onFocusField("priority")}
            onBlur={() => onFocusField(undefined)}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            size="large"
            variant="filled"
            className="w-full"
            disabled={disabled || createdCode != null}
          />
        </Field>

        <Field label="Mô tả sự cố" className="sm:col-span-2" {...props("description")}>
          <textarea
            {...common("description")}
            rows={2}
            onChange={(e) => onChange("description", e.target.value)}
            className={cn(inputClass(!!errors.description), "resize-y py-2 leading-relaxed")}
          />
        </Field>

        <Field label="Người đề nghị" className="sm:col-span-2" {...props("requester")} canConfirm={!requesterEmpty}>
          <input
            {...common("requester")}
            placeholder="Chữ viết tay khó đọc – vui lòng nhập"
            onChange={(e) => onChange("requester", e.target.value)}
            className={cn(inputClass(requesterEmpty || !!errors.requester), "h-10")}
          />
        </Field>

        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <Checkbox
            checked={values.signature === "yes"}
            onChange={(e) => onChange("signature", e.target.checked ? "yes" : "no")}
            disabled={disabled || createdCode != null}
            onFocus={() => onFocusField("signature")}
          >
            <span className="text-[12.5px] text-body">Phiếu có chữ ký người đề nghị</span>
          </Checkbox>
          {f("signature") && (
            <ConfidenceTag
              field={f("signature") as OcrField}
              reviewed={reviewed.has("signature")}
              canConfirm
              onConfirm={() => onConfirm("signature")}
            />
          )}
        </div>
      </div>

      {createdCode ? (
        <div className="mt-5 rounded-2xl border border-bamboo-200 bg-bamboo-50 p-4" role="status">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-bamboo-800">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Đã tạo hồ sơ nháp <span className="font-mono">{createdCode}</span>
          </p>
          <p className="mt-1 text-[12px] text-body">
            Ảnh gốc đã đính kèm. Bạn rà soát rồi gửi duyệt trong trang Hồ sơ.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/p/records" className={primaryButtonClass}>
              Mở hồ sơ
            </Link>
            <button type="button" onClick={onReset} className={secondaryButtonClass}>
              Nhập phiếu khác
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button type="button" onClick={onCreate} disabled={disabled} className={primaryButtonClass}>
            <Check className="h-4 w-4" aria-hidden />
            Tạo hồ sơ từ kết quả
          </button>
          <button type="button" onClick={onRescan} disabled={disabled} className={secondaryButtonClass}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Quét lại
          </button>
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Ảnh gốc được đính kèm vào hồ sơ · các trường bạn sửa được ghi lại để cải thiện mẫu nhận diện
      </p>
    </section>
  );
};
