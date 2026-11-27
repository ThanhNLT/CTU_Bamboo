/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Button, Checkbox, Input, Select } from "antd";
import { Plus, Trash2 } from "lucide-react";

import type { FormDef } from "../types";
import { tr, trf } from "../../../i18n";

const FIELD_TYPES = [
  tr("Chữ"),
  tr("Đoạn văn"),
  tr("Số"),
  tr("Ngày"),
  tr("Danh mục"),
  tr("Tệp (kiểm dịch)"),
  tr("Tham chiếu chứng từ"),
];

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
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {forms.map((f, i) => (
          <section
            key={i}
            className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card"
            aria-label={f.name}
          >
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label={tr("Tên biểu mẫu")}
                placeholder={tr("Tên biểu mẫu")}
                title={f.name}
                className="min-w-[200px] flex-[2_1_220px]"
                value={f.name}
                disabled={readOnly}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <Input
                aria-label={tr("Mã biểu mẫu")}
                placeholder={tr("Mã biểu mẫu")}
                title={f.key}
                className="min-w-[160px] flex-[1_1_180px] font-mono"
                value={f.key}
                disabled={readOnly}
                onChange={(e) => patch(i, { key: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") })}
              />
              {!readOnly && (
                <Button
                  aria-label={tr("Xóa biểu mẫu")}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => onChange(forms.filter((_, n) => n !== i))}
                />
              )}
            </div>
            <p className="m-0 mt-1 text-[11.5px] text-muted">
              {usedBy[f.key]?.length ? trf("Dùng ở: {0}", [usedBy[f.key].join(", ")]) : tr("Chưa gắn vào tác vụ nào")}
            </p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {f.fields.map((fd, j) => (
                <li key={j} className="flex flex-wrap items-center gap-2 rounded-xl border border-line/70 p-2">
                  <Input
                    aria-label={tr("Nhãn trường")}
                    placeholder={tr("Nhãn trường")}
                    title={fd.label}
                    className="min-w-[180px] flex-[1_1_220px]"
                    value={fd.label}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(i, { fields: f.fields.map((x, n) => (n === j ? { ...x, label: e.target.value } : x)) })
                    }
                  />
                  <Select
                    aria-label={tr("Kiểu trường")}
                    className="w-[170px] shrink-0"
                    value={fd.type}
                    disabled={readOnly}
                    options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => patch(i, { fields: f.fields.map((x, n) => (n === j ? { ...x, type: v } : x)) })}
                  />
                  <Checkbox
                    className="whitespace-nowrap"
                    checked={fd.required}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(i, { fields: f.fields.map((x, n) => (n === j ? { ...x, required: e.target.checked } : x)) })
                    }
                  >
                    {tr("Bắt buộc")}
                  </Checkbox>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={tr("Xóa trường")}
                      className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-red-600"
                      onClick={() => patch(i, { fields: f.fields.filter((_, n) => n !== j) })}
                    >
                      <Trash2 className="h-4 w-4" />
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
                onClick={() => patch(i, { fields: [...f.fields, { label: "", type: tr("Chữ"), required: false }] })}
              >
                {tr("+ Thêm trường")}
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
                name: tr("Biểu mẫu mới"),
                fields: [{ label: tr("Ý kiến"), type: tr("Đoạn văn"), required: false }],
              },
            ])
          }
        >
          {tr("Thêm biểu mẫu")}
        </Button>
      )}
      {forms.length === 0 && readOnly && <p className="text-[13px] text-muted">{tr("Quy trình chưa có biểu mẫu.")}</p>}
      <p className="m-0 text-[12px] text-muted">
        {tr("Thay đổi biểu mẫu được lưu cùng bản nháp (nút “Lưu bản nháp”).")}
      </p>
    </div>
  );
};
