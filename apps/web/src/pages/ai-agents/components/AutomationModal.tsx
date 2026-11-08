import { Checkbox, Form, Input, Modal, Radio, Select } from "antd";
import { useEffect } from "react";

import type { Agent, AutomationInput, TriggerOptions } from "../types";
import { tr, trf } from "../../../i18n";

const EXAMPLE = tr(
  "Đối chiếu đề nghị mua sắm với Quy chế mua sắm: từ 50 triệu đồng phải có đủ 3 báo giá và nhà cung cấp đề xuất. Thiếu thì bình luận nêu rõ phần thiếu và nhắc người lập; đủ thì không làm gì.",
);

/** Cấu hình tác tử tự hành động khi có sự kiện nghiệp vụ (ADR #72). */
export const AutomationModal = ({
  open,
  agent,
  options,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  agent?: Agent;
  options: TriggerOptions | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (v: AutomationInput) => void;
}) => {
  const [form] = Form.useForm<AutomationInput>();
  const allowed = Form.useWatch("allowed_actions", form) ?? [];

  useEffect(() => {
    if (!open || !agent) return;
    form.setFieldsValue({
      triggers: agent.triggers,
      instructions: agent.instructions ?? "",
      allowed_actions: agent.allowed_actions.length ? agent.allowed_actions : ["comment"],
      autonomy: agent.autonomy,
      webhook_url: agent.webhook_url ?? "",
    });
  }, [open, agent, form]);

  return (
    <Modal
      title={agent ? trf("Tự hành động: “{0}”", [agent.name]) : ""}
      open={open}
      okText={tr("Lưu")}
      cancelText={tr("Hủy")}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() =>
        form
          .validateFields()
          .then(onSubmit)
          .catch(() => undefined)
      }
      width={640}
    >
      <p className="mt-2 text-[12.5px] text-muted">
        {tr(
          "Khi sự kiện xảy ra, tác tử đọc chứng từ bằng quyền của người phụ trách (người đăng ký tác tử), tra quy chế nếu có công cụ search_docs, rồi chỉ làm những hành động được chọn dưới đây. Bỏ hết sự kiện là tắt tự hành động.",
        )}
      </p>
      <Form form={form} layout="vertical" requiredMark="optional" className="mt-3">
        <Form.Item name="triggers" label={tr("Sự kiện kích hoạt")}>
          <Select
            mode="multiple"
            allowClear
            placeholder={tr("Chọn sự kiện")}
            options={(options?.events ?? []).map((e) => ({ value: e.code, label: tr(e.label) }))}
          />
        </Form.Item>
        <Form.Item
          name="instructions"
          label={tr("Nhiệm vụ")}
          dependencies={["triggers"]}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_, v: string) =>
                (getFieldValue("triggers") ?? []).length && !v?.trim()
                  ? Promise.reject(new Error(tr("Ghi nhiệm vụ cho tác tử")))
                  : Promise.resolve(),
            }),
          ]}
        >
          <Input.TextArea rows={4} maxLength={4000} showCount placeholder={EXAMPLE} />
        </Form.Item>
        <Form.Item name="allowed_actions" label={tr("Hành động được phép")}>
          <Checkbox.Group
            className="flex flex-col gap-1.5"
            options={(options?.actions ?? []).map((a) => ({ value: a.code, label: tr(a.label) }))}
          />
        </Form.Item>
        {allowed.includes("webhook") && (
          <Form.Item
            name="webhook_url"
            label={tr("Địa chỉ webhook")}
            rules={[{ required: true, pattern: /^https:\/\//, message: tr("Nhập địa chỉ https://") }]}
          >
            <Input placeholder="https://" />
          </Form.Item>
        )}
        <Form.Item name="autonomy" label={tr("Mức tự chủ")}>
          <Radio.Group options={(options?.autonomy ?? []).map((a) => ({ value: a.code, label: tr(a.label) }))} />
        </Form.Item>
      </Form>
      <p className="text-[12px] text-muted">
        {tr(
          "Mô hình chỉ đề xuất; hệ thống kiểm từng hành động (đúng loại, tối đa 3, đích thông báo chỉ là người lập, người đang duyệt hoặc người phụ trách, che dữ liệu cá nhân) rồi mới làm. Mọi lần chạy được ghi nhật ký kiểm toán.",
        )}
      </p>
    </Modal>
  );
};
