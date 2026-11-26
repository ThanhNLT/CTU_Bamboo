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

import { App, Form, Modal, type FormInstance } from "antd";
import { useEffect, useId, useState, type ReactNode } from "react";

import { MODAL_Z } from "./zIndex";
import { tr } from "../../../i18n";

export const FormModal = <T extends object>({
  open,
  title,
  okText = tr("Lưu"),
  initial,
  onCancel,
  onSubmit,
  children,
  width = 560,
}: {
  open: boolean;
  title: string;
  okText?: string;
  initial: Partial<T>;
  onCancel: () => void;
  onSubmit: (values: T) => Promise<void>;
  children: (form: FormInstance<T>) => ReactNode;
  width?: number;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<T>();
  const [busy, setBusy] = useState(false);
  const formName = `admin${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initial as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText={tr("Hủy")}
      width={width}
      confirmLoading={busy}
      onCancel={onCancel}
      forceRender
      zIndex={MODAL_Z}
      onOk={async () => {
        let values: T;
        try {
          values = await form.validateFields();
        } catch {
          return;
        }
        setBusy(true);
        try {
          await onSubmit(values);
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} name={formName} layout="vertical" requiredMark="optional" className="mt-3">
        {children(form)}
      </Form>
    </Modal>
  );
};
