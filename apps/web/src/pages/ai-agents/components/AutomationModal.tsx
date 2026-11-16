/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import { Checkbox, Form, Input, Modal, Radio, Select } from "antd";
import { useEffect } from "react";

import type { Agent, AutomationInput, ProjectOption, TriggerOptions } from "../types";
import { tr, trf } from "../../../i18n";

const EXAMPLE = tr(
  "Đối chiếu đề nghị mua sắm với Quy chế mua sắm: từ 50 triệu đồng phải có đủ 3 báo giá và nhà cung cấp đề xuất. Thiếu thì bình luận nêu rõ phần thiếu và nhắc người lập; đủ thì không làm gì.",
);

export const AutomationModal = ({
  open,
  agent,
  options,
  projects,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  agent?: Agent;
  options: TriggerOptions | null;
  projects: ProjectOption[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (v: AutomationInput) => void;
}) => {
  const [form] = Form.useForm<AutomationInput>();
  const allowed = Form.useWatch("allowed_actions", form) ?? [];
  const autonomy = Form.useWatch("autonomy", form);
  const suggestOnly = new Set((options?.actions ?? []).filter((a) => a.suggest_only).map((a) => a.code));

  useEffect(() => {
    if (autonomy && autonomy !== "suggest" && allowed.some((a) => suggestOnly.has(a)))
      form.setFieldValue(
        "allowed_actions",
        allowed.filter((a) => !suggestOnly.has(a)),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autonomy]);

  useEffect(() => {
    if (!open || !agent) return;
    form.setFieldsValue({
      triggers: agent.triggers,
      instructions: agent.instructions ?? "",
      allowed_actions: agent.allowed_actions.length ? agent.allowed_actions : ["comment"],
      autonomy: agent.autonomy,
      webhook_url: agent.webhook_url ?? "",
      project_id: agent.project_id ?? undefined,
    });
  }, [open, agent, form]);

  return (
    <Modal
      title={agent ? trf("Tự hành động: “{0}”", [agent.name]) : ""}
      open={open}
      okText={tr("Lưu")}
      cancelText={tr("Hủy")}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() =>
        form
          .validateFields()
          .then(onSubmit)
          .catch(() => undefined)
      }
      width={640}
    >
      <p className="mt-2 text-[12.5px] text-muted">
        {tr(
          "Khi sự kiện xảy ra, tác tử đọc chứng từ bằng quyền của người phụ trách (người đăng ký tác tử), tra quy chế nếu có công cụ search_docs, rồi chỉ làm những hành động được chọn dưới đây. Bỏ hết sự kiện là tắt tự hành động.",
        )}
      </p>
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item name="triggers" label={tr("Sự kiện kích hoạt")}>
          <Select
            mode="multiple"
            allowClear
            placeholder={tr("Chọn sự kiện")}
            options={(options?.events ?? []).map((e) => ({ value: e.code, label: tr(e.label) }))}
          />
        </Form.Item>
        <Form.Item
          name="instructions"
          label={tr("Nhiệm vụ")}
          dependencies={["triggers"]}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_, v: string) =>
                (getFieldValue("triggers") ?? []).length && !v?.trim()
                  ? Promise.reject(new Error(tr("Ghi nhiệm vụ cho tác tử")))
                  : Promise.resolve(),
            }),
          ]}
        >
          <Input.TextArea rows={4} maxLength={4000} showCount placeholder={EXAMPLE} />
        </Form.Item>
        <Form.Item name="allowed_actions" label={tr("Hành động được phép")}>
          <Checkbox.Group
            className="flex flex-col gap-1.5"
            options={(options?.actions ?? []).map((a) => ({
              value: a.code,
              label: tr(a.label),
              disabled: a.suggest_only && autonomy !== "suggest",
            }))}
          />
        </Form.Item>
        {allowed.includes("project_task") && (
          <Form.Item
            name="project_id"
            label={tr("Dự án đích")}
            extra={tr("Công việc được tạo trong dự án này khi người quản lý dự án chấp nhận đề xuất.")}
            rules={[{ required: true, message: tr("Chọn dự án đích") }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={tr("Chọn dự án")}
              options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
            />
          </Form.Item>
        )}
        {allowed.includes("webhook") && (
          <Form.Item
            name="webhook_url"
            label={tr("Địa chỉ webhook")}
            rules={[{ required: true, pattern: /^https:\/\//, message: tr("Nhập địa chỉ https://") }]}
          >
            <Input placeholder="https://" />
          </Form.Item>
        )}
        <Form.Item
          name="autonomy"
          label={tr("Mức tự chủ")}
          extra={
            autonomy === "suggest"
              ? tr(
                  "Mỗi hành động thành một đề xuất cho người có thẩm quyền (người đang duyệt, quản lý dự án hoặc người phụ trách); người đó sửa được nội dung rồi chấp nhận để hệ thống thực hiện bằng quyền của chính họ.",
                )
              : undefined
          }
        >
          <Radio.Group options={(options?.autonomy ?? []).map((a) => ({ value: a.code, label: tr(a.label) }))} />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">
        {tr(
          "Mô hình chỉ đề xuất; hệ thống kiểm từng hành động (đúng loại, tối đa 3, đích thông báo chỉ là người lập, người đang duyệt hoặc người phụ trách, che dữ liệu cá nhân) rồi mới làm. Mọi lần chạy được ghi nhật ký kiểm toán.",
        )}
      </p>
    </Modal>
  );
};
