// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { App, Form, Input, Modal, Radio } from "antd";
import { request } from "../../api/client";
import { ACT_ON_TASK } from "../../pages/purchase-requests/queries";

export type Decision = "APPROVE" | "REJECT" | "RETURN";

type Props = {
  taskId: string | null;
  title?: string;
  viaDelegation?: boolean;
  onClose: () => void;
  onDone: () => void;
};

/** Duyệt / từ chối / trả về một việc duyệt (Action act_on_task). Từ chối, trả về bắt buộc lý do. */
export const ActModal = ({ taskId, title, viaDelegation, onClose, onDone }: Props) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ decision: Decision; note?: string }>();
  const [busy, setBusy] = useState(false);
  const decision = Form.useWatch("decision", form);

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const r = await request<{ act_on_task: { status: string } }>(ACT_ON_TASK, {
        task: taskId, decision: values.decision, note: values.note?.trim() || null,
      });
      message.success(`Đã ghi nhận. Trạng thái đề nghị: ${r.act_on_task.status}`);
      form.resetFields();
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!taskId} title={title ?? "Xử lý việc duyệt"} okText="Xác nhận" cancelText="Đóng"
           confirmLoading={busy} onOk={submit} onCancel={onClose} destroyOnHidden>
      {viaDelegation && <p>Bạn đang <b>duyệt thay</b> theo ủy quyền; lịch sử sẽ ghi rõ.</p>}
      <Form form={form} layout="vertical" initialValues={{ decision: "APPROVE" }}>
        <Form.Item name="decision" label="Quyết định">
          <Radio.Group optionType="button" buttonStyle="solid" options={[
            { value: "APPROVE", label: "Duyệt" },
            { value: "RETURN", label: "Trả về bổ sung" },
            { value: "REJECT", label: "Từ chối" },
          ]} />
        </Form.Item>
        <Form.Item name="note" label="Ý kiến"
                   rules={[{ required: decision !== "APPROVE", whitespace: true, message: "Từ chối hoặc trả về phải ghi lý do" }]}>
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};
