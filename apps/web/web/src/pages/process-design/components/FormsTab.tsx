// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Button, Checkbox, Input, Select } from "antd";
import { Plus, Trash2 } from "lucide-react";

import type { FormDef } from "../types";

const FIELD_TYPES = ["Chữ", "Đoạn văn", "Số", "Ngày", "Danh mục", "Tệp (kiểm dịch)", "Tham chiếu chứng từ"];

export const FormsTab = ({
  forms,
  usedBy,
  readOnly,
  onChange,
}: {
  forms: FormDef[];
  usedBy: Record<string, string[]>;
  readOnly: boolean;
  onChange: (forms: FormDef[]) => void;
}) => {
  const patch = (i: number, f: Partial<FormDef>) => onChange(forms.map((x, n) => (n === i ? { ...x, ...f } : x)));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {forms.map((f, i) => (
          <section key={i} className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-label={f.name}>
            <div className="flex gap-2">
              <Input
                aria-label="Tên biểu mẫu"
                value={f.name}
                disabled={readOnly}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <Input
                aria-label="Mã biểu mẫu"
                className="w-[160px] font-mono"
                value={f.key}
                disabled={readOnly}
                onChange={(e) => patch(i, { key: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") })}
              />
              {!readOnly && (
                <Button
                  aria-label="Xóa biểu mẫu"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => onChange(forms.filter((_, n) => n !== i))}
                />
              )}
            </div>
            <p className="m-0 mt-1 text-[11.5px] text-muted">
              {usedBy[f.key]?.length ? `Dùng ở: ${usedBy[f.key].join(", ")}` : "Chưa gắn vào tác vụ nào"}
            </p>
            <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
              {f.fields.map((fd, j) => (
                <li key={j} className="flex items-center gap-2">
                  <Input
                    aria-label="Nhãn trường"
                    size="small"
                    value={fd.label}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(i, { fields: f.fields.map((x, n) => (n === j ? { ...x, label: e.target.value } : x)) })
                    }
                  />
                  <Select
                    aria-label="Kiểu trường"
                    size="small"
                    className="w-[150px] shrink-0"
                    value={fd.type}
                    disabled={readOnly}
                    options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => patch(i, { fields: f.fields.map((x, n) => (n === j ? { ...x, type: v } : x)) })}
                  />
                  <Checkbox
                    checked={fd.required}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(i, { fields: f.fields.map((x, n) => (n === j ? { ...x, required: e.target.checked } : x)) })
                    }
                  >
                    Bắt buộc
                  </Checkbox>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label="Xóa trường"
                      className="text-muted hover:text-red-600"
                      onClick={() => patch(i, { fields: f.fields.filter((_, n) => n !== j) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!readOnly && (
              <Button
                size="small"
                type="link"
                className="mt-2 px-0"
                onClick={() => patch(i, { fields: [...f.fields, { label: "", type: "Chữ", required: false }] })}
              >
                + Thêm trường
              </Button>
            )}
          </section>
        ))}
      </div>
      {!readOnly && (
        <Button
          className="self-start"
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            onChange([
              ...forms,
              {
                key: `bieu_mau_${forms.length + 1}`,
                name: "Biểu mẫu mới",
                fields: [{ label: "Ý kiến", type: "Đoạn văn", required: false }],
              },
            ])
          }
        >
          Thêm biểu mẫu
        </Button>
      )}
      {forms.length === 0 && readOnly && <p className="text-[13px] text-muted">Quy trình chưa có biểu mẫu.</p>}
      <p className="m-0 text-[12px] text-muted">Thay đổi biểu mẫu được lưu cùng bản nháp (nút “Lưu bản nháp”).</p>
    </div>
  );
};
