// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import type { ActionProposal } from "../types";

type Values = Pick<ActionProposal, "recordType" | "device" | "description">;

const TYPES = ["Báo cáo lỗi dây chuyền", "Báo cáo tuần dây chuyền", "Báo cáo sự cố", "Đề nghị bảo trì"].map((v) => ({
  value: v,
  label: v,
}));

/** "Mở biểu mẫu để sửa": sửa nội dung trợ lý đề xuất trước khi tạo nháp. */
export const DraftFormModal = ({
  action,
  onCancel,
  onSubmit,
}: {
  action?: ActionProposal;
  onCancel: () => void;
  onSubmit: (v: Values) => void;
}) => {
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (action)
      form.setFieldsValue({ recordType: action.recordType, device: action.device, description: action.description });
  }, [action, form]);

  return (
    <Modal
      title="Hồ sơ nháp từ đề xuất của trợ lý"
      open={action != null}
      okText="Tạo nháp"
      cancelText="Hủy"
      onCancel={onCancel}
      onOk={() =>
        form
          .validateFields()
          .then(onSubmit)
          .catch(() => undefined)
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item name="recordType" label="Loại hồ sơ" rules={[{ required: true, message: "Chọn loại hồ sơ" }]}>
          <Select options={TYPES} />
        </Form.Item>
        <Form.Item
          name="device"
          label="Thiết bị"
          rules={[{ required: true, whitespace: true, message: "Nhập thiết bị" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="description"
          label="Mô tả"
          rules={[{ required: true, whitespace: true, min: 10, message: "Mô tả ít nhất 10 ký tự" }]}
        >
          <Input.TextArea rows={4} maxLength={1000} showCount />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">{action?.note}</p>
    </Modal>
  );
};
