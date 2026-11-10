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
