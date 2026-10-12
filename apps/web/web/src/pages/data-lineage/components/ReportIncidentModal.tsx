// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import { failedChecks } from "../graph";
import type { LineageNode } from "../types";

type Values = { nodeId: string; kind: string; description: string };

const KINDS = [
  { value: "wrong", label: "Dữ liệu sai" },
  { value: "missing", label: "Thiếu / rỗng dữ liệu" },
  { value: "late", label: "Cập nhật trễ" },
  { value: "other", label: "Khác" },
];

/** Báo sự cố dữ liệu: chọn tài sản, loại sự cố, mô tả. Tài sản đang có kiểm tra lỗi thì điền sẵn mô tả. */
export const ReportIncidentModal = ({
  open, nodes, defaultId, onCancel, onSubmit,
}: {
  open: boolean;
  nodes: LineageNode[];
  defaultId: string;
  onCancel: () => void;
  onSubmit: (v: Values) => void;
}) => {
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (!open) return;
    const node = nodes.find((n) => n.id === defaultId);
    const fails = node ? failedChecks(node) : [];
    form.setFieldsValue({
      nodeId: defaultId,
      kind: fails.length ? "missing" : "wrong",
      description: fails.map((c) => `Kiểm tra ${c.rule} lỗi: ${c.detail.replace(/^Lỗi · /, "")}${c.failedAt ? ` (lúc ${c.failedAt})` : ""}.`).join("\n"),
    });
  }, [open, defaultId, nodes, form]);

  return (
    <Modal
      title="Báo sự cố dữ liệu"
      open={open}
      okText="Gửi báo cáo"
      cancelText="Hủy"
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit).catch(() => undefined)}
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item name="nodeId" label="Tài sản dữ liệu" rules={[{ required: true, message: "Chọn tài sản" }]}>
          <Select showSearch optionFilterProp="label" options={nodes.map((n) => ({ value: n.id, label: `${n.fqn} · ${n.title}` }))} />
        </Form.Item>
        <Form.Item name="kind" label="Loại sự cố">
          <Select options={KINDS} />
        </Form.Item>
        <Form.Item
          name="description"
          label="Mô tả"
          rules={[{ required: true, whitespace: true, min: 10, message: "Mô tả ngắn gọn sự cố (ít nhất 10 ký tự)" }]}
        >
          <Input.TextArea rows={4} maxLength={1000} showCount placeholder="Ví dụ: số hồ sơ duyệt ngày 09/10 thấp bất thường so với Flowable" />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">Sự cố được gửi tới chủ sở hữu tài sản và ghi vào OpenMetadata; các tài sản phía sau được gắn cờ “Bị ảnh hưởng”.</p>
    </Modal>
  );
};
