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

import { Checkbox, Form, Input, Modal, Select, Switch } from "antd";
import { useEffect } from "react";

import type { Agent, AgentInput, AiModel } from "../types";
import { GUARDS, GUARD_INFO, TOOLS, guardOn } from "../utils";
import { tr, trf } from "../../../i18n";

type FormValues = Omit<AgentInput, "status">;

export const AgentModal = ({
  open,
  agent,
  models,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  agent?: Agent;
  models: AiModel[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
}) => {
  const [form] = Form.useForm<FormValues>();
  const options = models.map((m) => ({ value: m.name, label: m.name }));
  if (agent && !models.some((m) => m.name === agent.model)) options.unshift({ value: agent.model, label: agent.model });

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: agent?.name ?? "",
      model: agent?.model ?? models.find((m) => !/embed|bge/i.test(m.name))?.name,
      tool_list: agent?.tool_list ?? TOOLS.map((t) => t.key),
      guardrail_config: Object.fromEntries(
        GUARDS.map((g) => [g, agent ? guardOn(agent, g) : g !== "think"]),
      ) as FormValues["guardrail_config"],
    });
  }, [open, agent, models, form]);

  return (
    <Modal
      title={agent ? trf("Sửa “{0}”", [agent.name]) : tr("Đăng ký tác tử")}
      open={open}
      okText={agent ? tr("Lưu") : tr("Đăng ký")}
      cancelText={tr("Hủy")}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() =>
        form
          .validateFields()
          .then(onSubmit)
          .catch(() => undefined)
      }
      width={580}
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item
          name="name"
          label={tr("Tên tác tử")}
          rules={[{ required: true, whitespace: true, message: tr("Nhập tên tác tử") }]}
        >
          <Input maxLength={60} placeholder={tr("Ví dụ: Trợ lý quy chế")} />
        </Form.Item>
        <Form.Item
          name="model"
          label={tr("Mô hình (Ollama)")}
          rules={[{ required: true, message: tr("Chọn mô hình") }]}
          extra={models.length ? undefined : tr("Ollama chưa chạy nên chưa lấy được danh mục mô hình.")}
        >
          <Select options={options} placeholder={tr("Chọn mô hình")} />
        </Form.Item>
        <Form.Item
          name="tool_list"
          label={tr("Công cụ được phép gọi")}
          rules={[{ required: true, type: "array", min: 1, message: tr("Chọn ít nhất một công cụ") }]}
          extra={tr("Trợ lý chỉ hiện ở trang Trợ lý đa năng khi có cả search_docs và cite.")}
        >
          <Checkbox.Group
            options={TOOLS.map((t) => ({ value: t.key, label: t.label }))}
            className="flex flex-col gap-1.5"
          />
        </Form.Item>
        <div className="mb-1 text-[13px] text-ink">{tr("Rào chắn")}</div>
        <div className="flex flex-col gap-2.5">
          {GUARDS.map((g) => (
            <div key={g} className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-[12.5px]">
                <span className="font-mono text-ink">{GUARD_INFO[g].label}</span>
                <span className="block text-muted">{GUARD_INFO[g].description}</span>
              </span>
              <Form.Item name={["guardrail_config", g]} valuePropName="checked" noStyle>
                <Switch size="small" aria-label={GUARD_INFO[g].label} />
              </Form.Item>
            </div>
          ))}
        </div>
      </Form>
      <p className="mt-4 text-[12px] text-muted">
        {tr(
          "Tác tử không có quyền riêng: luôn đọc tài liệu bằng quyền của người hỏi. Mọi thay đổi được ghi nhật ký kiểm toán.",
        )}
      </p>
    </Modal>
  );
};
