// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Checkbox, Input, Select } from "antd";
import { MousePointerClick, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Dot } from "../../../components/ui";
import { FORMS, GROUPS, NODE_TYPE_LABEL, SERVICES } from "../mock";
import type { BpmnEdge, BpmnNode, Issue, ProcessModel, TaskDecision } from "../types";

const DECISIONS: Array<{ value: TaskDecision; label: string }> = [
  { value: "approve", label: "Duyệt" },
  { value: "return", label: "Trả lại bổ sung" },
  { value: "reject", label: "Từ chối" },
];

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-[11.5px] text-muted">{label}</span>
    {children}
  </label>
);

/** Tổng kết kiểm tra; bấm một mục để chọn phần tử gây ra nó. */
const ValidationBox = ({ issues, onFocusNode }: { issues: Issue[]; onFocusNode: (id: string) => void }) => {
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.length - errors;
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5" role="status" aria-live="polite">
      <div className="text-[12px] font-semibold text-ink">
        Kiểm tra: {errors} lỗi · {warnings} cảnh báo
      </div>
      {issues.length === 0 ? (
        <p className="mt-1 text-[11.5px] text-muted">Không có vấn đề nào.</p>
      ) : (
        <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
          {issues.map((i, k) => (
            <li key={k}>
              <button
                type="button"
                disabled={!i.nodeId}
                onClick={() => i.nodeId && onFocusNode(i.nodeId)}
                className="flex w-full items-start gap-2 text-left text-[11.5px] leading-snug text-body enabled:hover:text-ink disabled:cursor-default"
              >
                <Dot tone={i.level === "error" ? "danger" : "warning"} className="mt-[5px]" />
                <span>{i.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Cột phải: thuộc tính phần tử đang chọn + kết quả kiểm tra toàn quy trình. */
export const PropertiesPanel = ({
  node, model, issues, onChange, onEdgeChange, onDelete, onFocusNode,
}: {
  node?: BpmnNode;
  model: ProcessModel;
  issues: Issue[];
  /** `key` dùng để gộp các lần gõ liên tiếp thành một bước hoàn tác. */
  onChange: (patch: Partial<BpmnNode>, key: string) => void;
  onEdgeChange: (edgeId: string, patch: Partial<BpmnEdge>) => void;
  onDelete: () => void;
  onFocusNode: (id: string) => void;
}) => (
  <aside aria-label="Thuộc tính" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-white p-4 shadow-card">
    {!node ? (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <MousePointerClick className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
        <p className="text-[12.5px] text-muted">Chọn một phần tử trên sơ đồ để sửa thuộc tính.</p>
      </div>
    ) : (
      <>
        <header>
          <div className="text-[11.5px] text-muted">{NODE_TYPE_LABEL[node.type]}</div>
          <h2 className="mt-0.5 truncate text-[16px] font-semibold text-ink">{node.name || "(chưa đặt tên)"}</h2>
        </header>

        <div className="flex flex-col gap-3">
          <Field label={node.type === "userTask" || node.type === "serviceTask" ? "Tên bước" : "Tên"}>
            <Input
              variant="filled"
              value={node.name}
              maxLength={80}
              status={node.name.trim() ? undefined : "error"}
              onChange={(e) => onChange({ name: e.target.value }, `${node.id}.name`)}
            />
          </Field>

          {node.type === "userTask" && (
            <>
              <Field label="Nhóm xử lý">
                <Select
                  variant="filled"
                  className="w-full"
                  value={node.group}
                  placeholder="Chọn nhóm"
                  options={GROUPS}
                  status={node.group ? undefined : "error"}
                  onChange={(group: string) => onChange({ group }, `${node.id}.group`)}
                />
              </Field>
              <Field label="SLA">
                <Input
                  variant="filled"
                  value={node.sla}
                  placeholder="Ví dụ: 8 giờ làm việc"
                  status={node.sla?.trim() ? undefined : "error"}
                  onChange={(e) => onChange({ sla: e.target.value }, `${node.id}.sla`)}
                />
              </Field>
              <Field label="Biểu mẫu">
                <Select
                  variant="filled"
                  className="w-full"
                  value={node.form}
                  placeholder="Chọn biểu mẫu"
                  options={FORMS.map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(form: string) => onChange({ form }, `${node.id}.form`)}
                />
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-[11.5px] text-muted">Quyết định cho phép</legend>
                <Checkbox.Group
                  className="flex flex-col gap-1.5"
                  value={node.decisions ?? []}
                  options={DECISIONS}
                  onChange={(v) => onChange({ decisions: v as TaskDecision[] }, `${node.id}.decisions`)}
                />
              </fieldset>
            </>
          )}

          {node.type === "serviceTask" && (
            <Field label="Dịch vụ thực thi">
              <Select
                variant="filled"
                className="w-full"
                value={node.service}
                placeholder="Chọn dịch vụ"
                options={SERVICES}
                onChange={(service: string) => onChange({ service }, `${node.id}.service`)}
              />
            </Field>
          )}

          {node.type === "gateway" && (
            <fieldset>
              <legend className="mb-1.5 text-[11.5px] text-muted">Các nhánh ra</legend>
              <ul className="m-0 list-none space-y-2 p-0">
                {model.edges.filter((e) => e.from === node.id).map((e) => {
                  const target = model.nodes.find((n) => n.id === e.to);
                  return (
                    <li key={e.id} className="rounded-lg bg-canvas px-2.5 py-2">
                      <div className="text-[12.5px] text-ink">
                        <b className="font-semibold">{e.label ?? "(không tên)"}</b> → {target?.name ?? e.to}
                      </div>
                      <Checkbox
                        className="mt-1"
                        checked={e.notifySubmitter ?? false}
                        onChange={(ev) => onEdgeChange(e.id, { notifySubmitter: ev.target.checked })}
                      >
                        <span className="text-[12px]">Gửi thông báo cho người nộp</span>
                      </Checkbox>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </div>

        {node.type !== "start" && (
          <button type="button" onClick={onDelete} className="inline-flex h-8 items-center gap-1.5 self-start rounded-full border border-red-200 bg-white px-3 text-[12.5px] font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Xóa phần tử
          </button>
        )}
      </>
    )}

    <ValidationBox issues={issues} onFocusNode={onFocusNode} />
  </aside>
);
