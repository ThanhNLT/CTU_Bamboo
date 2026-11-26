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

import { Input, Modal, Segmented, Select } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { UserTaskRef } from "../utils";
import { tr, trf } from "../../../i18n";

export type SandboxInput = {
  decision: string;
  variables: Record<string, string | number | boolean>;
  taskDecisions: Record<string, string>;
};

type Row = { name: string; value: string };

const DECISIONS = [
  { value: "APPROVE", label: tr("Duyệt") },
  { value: "REJECT", label: tr("Từ chối") },
  { value: "RETURN", label: tr("Trả về") },
];
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

const typed = (v: string): string | number | boolean => {
  const t = v.trim();
  if (t === "true" || t === "false") return t === "true";
  return t !== "" && Number.isFinite(Number(t)) ? Number(t) : v;
};

export const SandboxModal = ({
  open,
  tasks,
  busy,
  onRun,
  onCancel,
}: {
  open: boolean;
  tasks: UserTaskRef[];
  busy: boolean;
  onRun: (input: SandboxInput) => void;
  onCancel: () => void;
}) => {
  const [decision, setDecision] = useState("APPROVE");
  const [rows, setRows] = useState<Row[]>([{ name: "amount", value: "10000000" }]);
  const [perTask, setPerTask] = useState<Record<string, string>>({});

  const names = rows.map((r) => r.name.trim()).filter(Boolean);
  const bad = names.find((n) => !NAME.test(n)) ?? names.find((n, i) => names.indexOf(n) !== i);
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...p } : r)));

  const run = () =>
    onRun({
      decision,
      variables: Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), typed(r.value)])),
      taskDecisions: Object.fromEntries(Object.entries(perTask).filter(([, v]) => v && v !== decision)),
    });

  return (
    <Modal
      open={open}
      title={tr("Chạy thử trong sandbox")}
      okText={tr("Chạy thử")}
      cancelText={tr("Hủy")}
      okButtonProps={{ disabled: Boolean(bad), loading: busy }}
      onOk={run}
      onCancel={onCancel}
      destroyOnHidden
      width={560}
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <p className="m-0 text-body">
          {tr(
            "Lưu bản nháp rồi deploy lên Flowable với khóa sandbox riêng, tự hoàn thành từng tác vụ người dùng. Không ảnh hưởng quy trình đang chạy.",
          )}
        </p>
        <div>
          <span className="mb-1 block text-[12px] font-medium text-body">{tr("Quyết định mặc định")}</span>
          <Segmented options={DECISIONS} value={decision} onChange={(v) => setDecision(v as string)} />
        </div>

        <div>
          <span className="mb-1 block text-[12px] font-medium text-body">
            {tr("Biến đầu vào (để thử điều kiện của cổng, ví dụ ")}{" "}
            <span className="font-mono">{"${amount > 50000000}"}</span>)
          </span>
          {rows.map((r, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2">
              <Input
                aria-label={trf("Tên biến {0}", [i + 1])}
                placeholder="amount"
                className="font-mono"
                value={r.name}
                status={r.name.trim() && !NAME.test(r.name.trim()) ? "error" : undefined}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <Input
                aria-label={trf("Giá trị biến {0}", [i + 1])}
                placeholder="10000000"
                value={r.value}
                onChange={(e) => patch(i, { value: e.target.value })}
              />
              <button
                type="button"
                aria-label={trf("Xóa biến {0}", [i + 1])}
                className="rounded-lg p-2 text-muted hover:bg-canvas"
                onClick={() => setRows(rows.filter((_, n) => n !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          {bad && (
            <p className="m-0 text-[12px] text-red-700">
              {tr("Tên biến “")}
              {bad}
              {tr("” không hợp lệ hoặc bị trùng.")}
            </p>
          )}
          <button
            type="button"
            className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-bamboo-700"
            onClick={() => setRows([...rows, { name: "", value: "" }])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> {tr(" Thêm biến")}
          </button>
        </div>

        {tasks.length > 0 && (
          <div>
            <span className="mb-1 block text-[12px] font-medium text-body">
              {tr("Quyết định riêng cho từng tác vụ")}
            </span>
            {tasks.map((t) => (
              <div key={t.id} className="mb-1.5 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate" title={t.id}>
                  {t.name}
                </span>
                <Select
                  aria-label={trf("Quyết định của {0}", [t.name])}
                  className="w-36 shrink-0"
                  value={perTask[t.id] ?? decision}
                  options={DECISIONS}
                  onChange={(v) => setPerTask({ ...perTask, [t.id]: v })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
