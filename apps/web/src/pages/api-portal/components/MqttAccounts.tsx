import { Alert, App, Form, Input, Modal, Table, Tag } from "antd";
import { Copy, Plus, RadioTower, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui/buttons";
import { copyText } from "../../../utils/clipboard";
import { formatDate } from "../../../utils/format";
import {
  createMqttAccount,
  fetchMqttAccounts,
  revokeMqttAccount,
  type CreatedMqttAccount,
  type MqttAccount,
} from "../api";
import { tr, trf } from "../../../i18n";

const SAMPLE = `{"temperature": {"type": "Property", "value": 21.4, "observedAt": "2026-11-06T08:00:00+07:00"}}`;

/** Tài khoản MQTT cho thiết bị / cổng OT gửi số đo vào Bản sao số (ADR #74). */
export const MqttAccounts = () => {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<MqttAccount[]>([]);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedMqttAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ label: string }>();

  const load = useCallback(async () => {
    try {
      setRows(await fetchMqttAccounts());
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async ({ label }: { label: string }) => {
    setSaving(true);
    try {
      setCreated(await createMqttAccount(label));
      setCreating(false);
      form.resetFields();
      await load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const revoke = (a: MqttAccount) =>
    modal.confirm({
      title: trf("Thu hồi tài khoản “{0}”?", [a.label]),
      content: tr("Thiết bị đang dùng tài khoản này bị ngắt kết nối ngay và không gửi được số đo nữa."),
      okText: tr("Thu hồi"),
      okButtonProps: { danger: true },
      cancelText: tr("Hủy"),
      onOk: async () => {
        try {
          await revokeMqttAccount(a.username);
          message.success(trf("Đã thu hồi {0}.", [a.label]));
          await load();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label={tr("Thiết bị MQTT")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <RadioTower className="h-4 w-4 text-bamboo-700" aria-hidden />
            {tr("Thiết bị MQTT")}
          </h2>
          <p className="m-0 mt-1 max-w-3xl text-[12.5px] text-muted">
            {tr(
              "Thiết bị hoặc cổng OT gửi số đo vào Bản sao số qua broker MQTT của hệ thống. Mỗi tài khoản chỉ được gửi vào nhánh chủ đề của công ty; thân bản tin theo NGSI-LD. Hệ thống ngoài không dùng MQTT thì gửi qua REST NGSI-LD bằng khóa API phạm vi iot.write.",
            )}
          </p>
        </div>
        <button type="button" className={smallPrimaryButtonClass} onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {tr("Tạo tài khoản")}
        </button>
      </div>
      <pre className="m-0 mt-3 overflow-x-auto rounded-xl bg-canvas p-3 font-mono text-[11.5px] text-body">
        {`mosquitto_pub -h <host> -p 1883 -u <username> -P <password> \\\n  -t bamboo/<tenant>/<device>/attrs -m '${SAMPLE}'`}
      </pre>
      <Table<MqttAccount>
        className="mt-3"
        size="small"
        rowKey="username"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: tr("Chưa có tài khoản thiết bị.") }}
        columns={[
          { title: tr("Tên gợi nhớ"), dataIndex: "label" },
          {
            title: tr("Tài khoản"),
            dataIndex: "username",
            render: (v: string) => <code className="font-mono text-[12px]">{v}</code>,
          },
          { title: tr("Người tạo"), render: (_, r) => r.created_by_person?.full_name ?? "—" },
          { title: tr("Ngày tạo"), dataIndex: "created_at", render: (v: string) => formatDate(v) },
          {
            title: tr("Trạng thái"),
            render: (_, r) =>
              r.revoked_at ? <Tag color="red">{tr("Đã thu hồi")}</Tag> : <Tag color="green">{tr("Hoạt động")}</Tag>,
          },
          {
            title: "",
            align: "right",
            render: (_, r) =>
              !r.revoked_at && (
                <button type="button" className={smallSecondaryButtonClass} onClick={() => revoke(r)}>
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  {tr("Thu hồi")}
                </button>
              ),
          },
        ]}
      />

      <Modal
        open={creating}
        title={tr("Tạo tài khoản thiết bị MQTT")}
        okText={tr("Tạo")}
        cancelText={tr("Hủy")}
        confirmLoading={saving}
        onCancel={() => setCreating(false)}
        onOk={() =>
          form
            .validateFields()
            .then(submit)
            .catch(() => undefined)
        }
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item
            name="label"
            label={tr("Tên gợi nhớ")}
            rules={[{ required: true, whitespace: true, max: 80, message: tr("Nhập tên gợi nhớ (tối đa 80 ký tự)") }]}
          >
            <Input placeholder={tr("Ví dụ: Cổng OT nhà máy Bắc Ninh")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={created != null}
        title={tr("Tài khoản thiết bị đã tạo")}
        footer={null}
        onCancel={() => setCreated(null)}
      >
        <Alert type="warning" showIcon message={tr("Lưu mật khẩu ngay: hệ thống không hiện lại")} className="mb-3" />
        {created && (
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
            <dt className="text-muted">{tr("Tài khoản")}</dt>
            <dd className="m-0 font-mono">{created.username}</dd>
            <dt className="text-muted">{tr("Mật khẩu")}</dt>
            <dd className="m-0 flex items-center gap-2">
              <code className="min-w-0 break-all font-mono">{created.password}</code>
              <button
                type="button"
                className={smallSecondaryButtonClass}
                aria-label={tr("Sao chép mật khẩu")}
                onClick={() => void copyText(created.password).then(() => message.success(tr("Đã sao chép.")))}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </button>
            </dd>
            <dt className="text-muted">{tr("Chủ đề")}</dt>
            <dd className="m-0 font-mono">{created.topic}</dd>
          </dl>
        )}
      </Modal>
    </section>
  );
};
