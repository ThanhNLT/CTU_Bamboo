// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { App, Form, Modal, type FormInstance } from "antd"; // Ant Design
import { useEffect, useId, useState, type ReactNode } from "react"; // React

// ===== Module nội bộ =====
import { MODAL_Z } from "./zIndex";

// ===== Component =====
/**
 * Hộp thoại form quản trị: điền sẵn khi mở, kiểm tra trường, gọi `onSubmit` (Action), báo lỗi máy chủ nguyên văn và
 * giữ hộp thoại mở để sửa.
 */
export const FormModal = <T extends object>({
  open,
  title,
  okText = "Lưu",
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
  // Tên riêng cho từng form: các hộp thoại render sẵn cùng lúc, trùng id trường thì nhãn trỏ nhầm ô.
  const formName = `admin${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initial as never);
    }
    // Chỉ điền lại khi mở hộp thoại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText="Hủy"
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
