// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";

import { failedChecks } from "../graph";
import type { LineageNode } from "../types";
import { tr, trf } from "../../../i18n";

type Values = { nodeId: string; kind: string; description: string };

const KINDS = [
  { value: "wrong", label: tr("Dữ liệu sai") },
  { value: "missing", label: tr("Thiếu / rỗng dữ liệu") },
  { value: "late", label: tr("Cập nhật trễ") },
  { value: "other", label: tr("Khác") },
];

export const ReportIncidentModal = ({
  open,
  nodes,
  defaultId,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  nodes: LineageNode[];
  defaultId: string;
  onCancel: () => void;
  onSubmit: (v: Values) => void | Promise<void>;
}) => {
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (!open) return;
    const node = nodes.find((n) => n.id === defaultId);
    const fails = node ? failedChecks(node) : [];
    form.setFieldsValue({
      nodeId: defaultId,
      kind: fails.length ? "missing" : "wrong",
      description: fails
        .map((c) =>
          trf("Kiểm tra {0} lỗi: {1}{2}.", [
            c.rule,
            c.detail.replace(/^Lỗi · /, ""),
            c.failedAt ? trf(" (lúc {0})", [c.failedAt]) : "",
          ]),
        )
        .join("\n"),
    });
  }, [open, defaultId, nodes, form]);

  return (
    <Modal
      title={tr("Báo sự cố dữ liệu")}
      open={open}
      okText={tr("Gửi báo cáo")}
      cancelText={tr("Hủy")}
      onCancel={onCancel}
      onOk={() =>
        form
          .validateFields()
          .then(onSubmit)
          .catch(() => undefined)
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item
          name="nodeId"
          label={tr("Tài sản dữ liệu")}
          rules={[{ required: true, message: tr("Chọn tài sản") }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={nodes.map((n) => ({ value: n.id, label: `${n.fqn} · ${n.title}` }))}
          />
        </Form.Item>
        <Form.Item name="kind" label={tr("Loại sự cố")}>
          <Select options={KINDS} />
        </Form.Item>
        <Form.Item
          name="description"
          label={tr("Mô tả")}
          rules={[
            { required: true, whitespace: true, min: 10, message: tr("Mô tả ngắn gọn sự cố (ít nhất 10 ký tự)") },
          ]}
        >
          <Input.TextArea
            rows={4}
            maxLength={1000}
            showCount
            placeholder={tr("Ví dụ: số hồ sơ duyệt ngày 09/10 thấp bất thường so với Flowable")}
          />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">
        {tr("Sự cố được ghi lại kèm người báo và thời điểm để chủ sở hữu tài sản xử lý.")}
      </p>
    </Modal>
  );
};
