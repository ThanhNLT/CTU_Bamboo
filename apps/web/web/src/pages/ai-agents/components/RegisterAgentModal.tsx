// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Checkbox, Form, Input, Modal, Select } from "antd"; // Ant Design
import { useEffect } from "react"; // React

// ===== Module nội bộ =====
import { GUARD_INFO, MODELS, SCOPE_OPTIONS, TOOL_CATALOG } from "../mock";
import type { GuardKey } from "../types";

// ===== Kiểu dữ liệu =====
export type RegisterValues = {
  name: string;
  description: string;
  model: string;
  tools: string[];
  scopes: string[];
  guards: GuardKey[];
};

// ===== Hằng số =====
const GUARDS = Object.keys(GUARD_INFO) as GuardKey[];

// ===== Component =====
/** Đăng ký tác tử mới: tác tử vào trạng thái "Chờ duyệt" cho tới khi quản trị viên duyệt. */
export const RegisterAgentModal = ({
  open,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  onCancel: () => void;
  onSubmit: (v: RegisterValues) => void;
}) => {
  const [form] = Form.useForm<RegisterValues>();

  useEffect(() => {
    if (open)
      form.setFieldsValue({ name: "", description: "", model: "Qwen3-14B", tools: [], scopes: [], guards: GUARDS });
  }, [open, form]);

  return (
    <Modal
      title="Đăng ký tác tử"
      open={open}
      okText="Gửi duyệt"
      cancelText="Hủy"
      onCancel={onCancel}
      onOk={() =>
        form
          .validateFields()
          .then(onSubmit)
          .catch(() => undefined)
      }
      width={560}
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item
          name="name"
          label="Tên tác tử"
          rules={[{ required: true, whitespace: true, message: "Nhập tên tác tử" }]}
        >
          <Input maxLength={60} placeholder="Ví dụ: Trợ lý mua sắm" />
        </Form.Item>
        <Form.Item
          name="description"
          label="Mô tả ngắn"
          rules={[{ required: true, whitespace: true, message: "Nêu tác tử làm gì" }]}
        >
          <Input maxLength={80} placeholder="Ví dụ: Tra giá, soạn đề nghị mua sắm nháp" />
        </Form.Item>
        <Form.Item name="model" label="Mô hình">
          <Select options={MODELS.map((m) => ({ value: m, label: m }))} />
        </Form.Item>
        <Form.Item
          name="tools"
          label="Công cụ được phép gọi"
          rules={[{ required: true, type: "array", min: 1, message: "Chọn ít nhất một công cụ" }]}
        >
          <Select
            mode="multiple"
            options={TOOL_CATALOG.map((t) => ({ value: t, label: t }))}
            placeholder="Chọn công cụ"
          />
        </Form.Item>
        <Form.Item
          name="scopes"
          label="Phạm vi dữ liệu"
          rules={[{ required: true, type: "array", min: 1, message: "Chọn phạm vi dữ liệu" }]}
        >
          <Select
            mode="multiple"
            options={SCOPE_OPTIONS.map((s) => ({ value: s, label: s }))}
            placeholder="Chọn phạm vi"
          />
        </Form.Item>
        <Form.Item name="guards" label="Rào chắn">
          <Checkbox.Group
            options={GUARDS.map((g) => ({ value: g, label: `${g} — ${GUARD_INFO[g].description}` }))}
            className="flex flex-col gap-1.5"
          />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">
        Tác tử mới ở trạng thái “Chờ duyệt”; công cụ luôn chạy bằng quyền của người hỏi.
      </p>
    </Modal>
  );
};
