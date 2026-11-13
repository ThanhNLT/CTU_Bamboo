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

import { useState } from "react";
import { App, Form, Input, Modal, Radio } from "antd";

import { request } from "../../api/client";
import { ACT_ON_TASK } from "../../pages/purchase-requests/queries";
import { tr, trf } from "../../i18n";

export type Decision = "APPROVE" | "REJECT" | "RETURN";

type Props = {
  taskId: string | null;
  title?: string;
  viaDelegation?: boolean;
  onClose: () => void;
  onDone: () => void;
};

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
        task: taskId,
        decision: values.decision,
        note: values.note?.trim() || null,
      });
      message.success(trf("Đã ghi nhận. Trạng thái đề nghị: {0}", [r.act_on_task.status]));
      form.resetFields();
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!taskId}
      title={title ?? tr("Xử lý việc duyệt")}
      okText={tr("Xác nhận")}
      cancelText={tr("Đóng")}
      confirmLoading={busy}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
    >
      {viaDelegation && (
        <p>
          {tr("Bạn đang ")} <b>{tr("duyệt thay")}</b> {tr(" theo ủy quyền; lịch sử sẽ ghi rõ.")}
        </p>
      )}
      <Form form={form} layout="vertical" initialValues={{ decision: "APPROVE" }}>
        <Form.Item name="decision" label={tr("Quyết định")}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: "APPROVE", label: tr("Duyệt") },
              { value: "RETURN", label: tr("Trả về bổ sung") },
              { value: "REJECT", label: tr("Từ chối") },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="note"
          label={tr("Ý kiến")}
          rules={[
            { required: decision !== "APPROVE", whitespace: true, message: tr("Từ chối hoặc trả về phải ghi lý do") },
          ]}
        >
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};
