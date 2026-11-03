// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Input, Select } from "antd";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { FormDef, Issue, SelectedElement } from "../types";
import { tr } from "../../../i18n";

const TYPE_LABEL: Record<string, string> = {
  StartEvent: tr("Sự kiện bắt đầu"),
  EndEvent: tr("Sự kiện kết thúc"),
  UserTask: tr("Tác vụ người dùng"),
  ServiceTask: tr("Tác vụ dịch vụ"),
  ScriptTask: tr("Tác vụ script"),
  Task: tr("Tác vụ"),
  ExclusiveGateway: tr("Cổng rẽ nhánh (một nhánh)"),
  ParallelGateway: tr("Cổng song song"),
  InclusiveGateway: tr("Cổng rẽ nhánh (nhiều nhánh)"),
  SequenceFlow: tr("Luồng"),
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[12px] font-medium text-body">{label}</span>
    <span className="mt-1 block">{children}</span>
    {hint && <span className="mt-1 block text-[11.5px] text-muted">{hint}</span>}
  </label>
);

export const PropertiesPanel = ({
  element,
  forms,
  issues,
  readOnly,
  showChecks = true,
  onChange,
  onFocus,
}: {
  element?: SelectedElement;
  forms: FormDef[];
  issues: Issue[];
  readOnly: boolean;
  showChecks?: boolean;
  onChange: (patch: Partial<SelectedElement>) => void;
  onFocus: (id: string) => void;
}) => {
  const errors = issues.filter((i) => i.level === "error").length;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-label={tr("Thuộc tính")}>
        <h2 className="m-0 text-[14px] font-semibold text-ink">{tr("Thuộc tính")}</h2>
        {!element ? (
          <p className="m-0 mt-2 text-[12.5px] text-muted">
            {tr("Chọn một phần tử trên sơ đồ để xem và sửa thuộc tính.")}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="m-0 text-[12px] text-muted">
              {TYPE_LABEL[element.type] ?? element.type} · <span className="font-mono">{element.id}</span>
            </p>
            <Field label={tr("Tên")}>
              <Input
                aria-label={tr("Tên phần tử")}
                value={element.name}
                disabled={readOnly}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </Field>
            {element.type === "UserTask" && (
              <>
                <Field
                  label={tr("Nhóm nhận việc")}
                  hint={tr("Mã nhóm / vai trò, cách nhau bằng dấu phẩy (candidateGroups)")}
                >
                  <Input
                    aria-label={tr("Nhóm nhận việc")}
                    value={element.candidateGroups ?? ""}
                    disabled={readOnly}
                    placeholder="TRUONG_PHONG, KE_TOAN"
                    onChange={(e) => onChange({ candidateGroups: e.target.value })}
                  />
                </Field>
                <Field
                  label={tr("Người nhận cố định")}
                  hint={tr("Để trống nếu giao cho nhóm; nhận biểu thức ${initiator}")}
                >
                  <Input
                    aria-label={tr("Người nhận")}
                    value={element.assignee ?? ""}
                    disabled={readOnly}
                    onChange={(e) => onChange({ assignee: e.target.value })}
                  />
                </Field>
                <Field label={tr("Hạn xử lý (SLA)")} hint={tr("ISO-8601: PT48H = 48 giờ, P3D = 3 ngày")}>
                  <Input
                    aria-label={tr("Hạn xử lý")}
                    value={element.dueDate ?? ""}
                    disabled={readOnly}
                    placeholder="PT48H"
                    onChange={(e) => onChange({ dueDate: e.target.value })}
                  />
                </Field>
                <Field label={tr("Biểu mẫu")}>
                  <Select
                    aria-label={tr("Biểu mẫu của tác vụ")}
                    className="w-full"
                    allowClear
                    disabled={readOnly}
                    value={element.formKey || undefined}
                    onChange={(v?: string) => onChange({ formKey: v ?? "" })}
                    options={forms.map((f) => ({ value: f.key, label: `${f.name} (${f.key})` }))}
                    notFoundContent={tr("Chưa có biểu mẫu: thêm ở tab Biểu mẫu")}
                  />
                </Field>
              </>
            )}
            {element.type === "ServiceTask" && (
              <>
                <Field
                  label={tr("Hành động tự động")}
                  hint={tr("Hệ thống tự thực hiện khi quy trình chạy tự động (bật ở tab Chạy tự động)")}
                >
                  <Select
                    aria-label={tr("Hành động tự động")}
                    className="w-full"
                    allowClear
                    disabled={readOnly}
                    value={element.automationAction || undefined}
                    placeholder={tr("Chưa chọn")}
                    options={[
                      { value: "notify", label: tr("Gửi thông báo") },
                      { value: "http", label: tr("Gọi API ngoài (https)") },
                      { value: "setvar", label: tr("Đặt giá trị biến") },
                    ]}
                    onChange={(v?: string) => onChange({ automationAction: v ?? "" })}
                  />
                </Field>
                {element.automationAction === "http" && (
                  <>
                    <Field
                      label={tr("Địa chỉ API")}
                      hint={tr("https, tên miền cố định; chỉ phần đường dẫn dùng được {biến}. Địa chỉ nội bộ bị chặn")}
                    >
                      <Input
                        aria-label={tr("Địa chỉ API")}
                        className="font-mono"
                        disabled={readOnly}
                        placeholder="https://api.example.org/don/{ma}"
                        value={element.automationUrl ?? ""}
                        onChange={(e) => onChange({ automationUrl: e.target.value })}
                      />
                    </Field>
                    <Field label={tr("Phương thức")}>
                      <Select
                        aria-label={tr("Phương thức")}
                        className="w-full"
                        disabled={readOnly}
                        value={element.automationMethod || "POST"}
                        options={[
                          { value: "POST", label: "POST" },
                          { value: "GET", label: "GET" },
                        ]}
                        onChange={(v: string) => onChange({ automationMethod: v })}
                      />
                    </Field>
                    {(element.automationMethod || "POST") === "POST" && (
                      <Field
                        label={tr("Nội dung JSON")}
                        hint={tr('Dùng {biến}, ví dụ {"gia": {amount}}. Tối đa 2000 ký tự')}
                      >
                        <Input.TextArea
                          aria-label={tr("Nội dung JSON")}
                          autoSize={{ minRows: 2 }}
                          className="font-mono"
                          maxLength={2000}
                          disabled={readOnly}
                          value={element.automationBody ?? ""}
                          onChange={(e) => onChange({ automationBody: e.target.value })}
                        />
                      </Field>
                    )}
                    <p className="m-0 text-[11.5px] text-muted">
                      {tr("Kết quả lưu vào biến ")} <span className="font-mono">{element.id}_status</span>,{" "}
                      <span className="font-mono">{element.id}_ok</span> {tr(" và")}{" "}
                      <span className="font-mono">{element.id}_body</span> {tr(" để cổng rẽ nhánh dùng.")}
                    </p>
                  </>
                )}
                {element.automationAction === "setvar" && (
                  <>
                    <Field label={tr("Tên biến")}>
                      <Input
                        aria-label={tr("Tên biến")}
                        className="font-mono"
                        disabled={readOnly}
                        value={element.automationName ?? ""}
                        onChange={(e) => onChange({ automationName: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={tr("Giá trị")}
                      hint={tr("Có thể dùng {biến} khác; số và true/false được nhận đúng kiểu")}
                    >
                      <Input
                        aria-label={tr("Giá trị biến")}
                        disabled={readOnly}
                        maxLength={200}
                        value={element.automationValue ?? ""}
                        onChange={(e) => onChange({ automationValue: e.target.value })}
                      />
                    </Field>
                  </>
                )}
                {element.automationAction === "notify" && (
                  <>
                    <Field label={tr("Người nhận")}>
                      <Select
                        aria-label={tr("Người nhận thông báo")}
                        className="w-full"
                        disabled={readOnly}
                        value={element.automationAudience || "INITIATOR"}
                        options={[
                          { value: "INITIATOR", label: tr("Người khởi chạy") },
                          { value: "UNIT", label: tr("Cả phòng ban sở hữu quy trình") },
                          { value: "COMPANY", label: tr("Cả công ty") },
                          { value: "GROUP", label: tr("Toàn tập đoàn") },
                        ]}
                        onChange={(v: string) => onChange({ automationAudience: v })}
                      />
                    </Field>
                    <Field label={tr("Nội dung thông báo")} hint={tr("Tối đa 500 ký tự; dùng {biến} để chèn giá trị")}>
                      <Input.TextArea
                        aria-label={tr("Nội dung thông báo")}
                        autoSize={{ minRows: 2 }}
                        maxLength={500}
                        disabled={readOnly}
                        value={element.automationMessage ?? ""}
                        onChange={(e) => onChange({ automationMessage: e.target.value })}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            {element.type === "StartEvent" && (
              <Field
                label={tr("Hẹn giờ bắt đầu")}
                hint={tr(
                  "Để trống: chỉ khởi chạy tay. Chu kỳ lặp ISO-8601, tối thiểu 1 phút: R/PT1H (mỗi giờ), R/P1D (mỗi ngày), R5/PT30M (5 lần, mỗi 30 phút)",
                )}
              >
                <Input
                  aria-label={tr("Chu kỳ hẹn giờ")}
                  className="font-mono"
                  disabled={readOnly}
                  placeholder="R/P1D"
                  value={element.timerCycle ?? ""}
                  onChange={(e) => onChange({ timerCycle: e.target.value })}
                />
              </Field>
            )}
            {element.type === "SequenceFlow" &&
              (element.isDefaultFlow ? (
                <p className="m-0 text-[12.5px] text-body">
                  {tr("Nhánh mặc định của cổng (đi khi không nhánh nào thỏa).")}
                </p>
              ) : (
                <Field label={tr("Điều kiện")} hint={tr("Biểu thức Flowable, ví dụ ${decision == 'APPROVE'}")}>
                  <Input.TextArea
                    aria-label={tr("Điều kiện của luồng")}
                    autoSize={{ minRows: 2 }}
                    className="font-mono"
                    value={element.condition ?? ""}
                    disabled={readOnly}
                    onChange={(e) => onChange({ condition: e.target.value })}
                  />
                </Field>
              ))}
          </div>
        )}
      </section>

      {showChecks && (
        <section
          className="rounded-2xl border border-line bg-surface p-4 shadow-card"
          aria-label={tr("Kết quả kiểm tra")}
        >
          <h2 className="m-0 flex items-center gap-2 text-[14px] font-semibold text-ink">
            {tr("Kiểm tra")}
            <span className={cn("text-[12px] font-medium", errors ? "text-red-700" : "text-bamboo-700")}>
              {errors} {tr(" lỗi · ")} {issues.length - errors} {tr(" cảnh báo")}
            </span>
          </h2>
          {issues.length === 0 ? (
            <p className="m-0 mt-2 flex items-center gap-1.5 text-[12.5px] text-bamboo-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {tr(" Không có vấn đề.")}
            </p>
          ) : (
            <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
              {issues.map((i, n) => (
                <li key={`${i.elementId}-${n}`}>
                  <button
                    type="button"
                    disabled={!i.elementId}
                    onClick={() => i.elementId && onFocus(i.elementId)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-canvas disabled:cursor-default"
                  >
                    {i.level === "error" ? (
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-label={tr("Lỗi")} />
                    ) : (
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                        aria-label={tr("Cảnh báo")}
                      />
                    )}
                    <span className="text-ink">{i.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
