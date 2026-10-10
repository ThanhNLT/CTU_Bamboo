// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import type { Dataset } from "../types";

type Values = { datasetId: string; purpose: string; duration: string };

/** Yêu cầu quyền truy cập một tập dữ liệu: chọn tập, nêu mục đích (bắt buộc), thời hạn. */
export const RequestAccessModal = ({
  open, datasets, defaultId, onCancel, onSubmit,
}: {
  open: boolean;
  datasets: Dataset[];
  defaultId?: string;
  onCancel: () => void;
  onSubmit: (v: Values) => void;
}) => {
  const [form] = Form.useForm<Values>();

  // Mỗi lần mở, chọn sẵn tập dữ liệu đang xem.
  useEffect(() => {
    if (open) form.setFieldsValue({ datasetId: defaultId, purpose: "", duration: "90d" });
  }, [open, defaultId, form]);

  return (
    <Modal
      title="Yêu cầu quyền truy cập"
      open={open}
      okText="Gửi yêu cầu"
      cancelText="Hủy"
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit).catch(() => undefined)}
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item name="datasetId" label="Tập dữ liệu" rules={[{ required: true, message: "Chọn tập dữ liệu" }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={datasets.map((d) => ({ value: d.id, label: `${d.title} · ${d.table}` }))}
          />
        </Form.Item>
        <Form.Item
          name="purpose"
          label="Mục đích sử dụng"
          rules={[{ required: true, whitespace: true, min: 10, message: "Nêu rõ mục đích (ít nhất 10 ký tự)" }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="Ví dụ: dựng báo cáo SLA hằng tuần cho phòng Kỹ thuật" />
        </Form.Item>
        <Form.Item name="duration" label="Thời hạn">
          <Select
            options={[
              { value: "30d", label: "30 ngày" },
              { value: "90d", label: "90 ngày" },
              { value: "1y", label: "1 năm" },
            ]}
          />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">Chủ sở hữu tập dữ liệu duyệt yêu cầu; mọi quyền được cấp đều ghi nhật ký kiểm toán.</p>
    </Modal>
  );
};
