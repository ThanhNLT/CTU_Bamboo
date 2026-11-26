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

import { Alert, App, Checkbox, Form, Input, Modal, Select, Table, Tag } from "antd";
import { Copy, KeyRound, Plus, ShieldOff } from "lucide-react";
import { useState } from "react";

import { smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui/buttons";
import { copyText } from "../../../utils/clipboard";
import { formatDate } from "../../../utils/format";
import { createKey, revokeKey, statusOf, type KeyStatus } from "../api";
import type { ApiKey, CreatedKey, KeyInput, Scope } from "../types";
import { tr, trf } from "../../../i18n";

const STATUS: Record<KeyStatus, { label: string; color: string }> = {
  active: { label: tr("Hoạt động"), color: "green" },
  expired: { label: tr("Hết hạn"), color: "default" },
  revoked: { label: tr("Đã thu hồi"), color: "red" },
};

const EXPIRY = [30, 90, 180, 365];

const sum = (k: ApiKey, f: "calls" | "errors") => k.usages.reduce((s, u) => s + u[f], 0);

export const ApiKeys = ({ keys, scopes, onChanged }: { keys: ApiKey[]; scopes: Scope[]; onChanged: () => void }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<KeyInput>();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);

  const submit = async (values: KeyInput) => {
    setSaving(true);
    try {
      setCreated(await createKey({ ...values, allowed_ips: values.allowed_ips ?? [] }));
      setCreating(false);
      form.resetFields();
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const revoke = (k: ApiKey) =>
    modal.confirm({
      title: trf("Thu hồi khóa “{0}”?", [k.name]),
      content: tr(
        "Hệ thống đang dùng khóa này sẽ bị từ chối ngay lập tức. Không thể khôi phục; thao tác được ghi nhật ký.",
      ),
      okText: tr("Thu hồi"),
      okButtonProps: { danger: true },
      cancelText: tr("Hủy"),
      onOk: async () => {
        try {
          await revokeKey(k.id);
          message.success(trf("Đã thu hồi {0}.", [k.name]));
          onChanged();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[12.5px] text-muted">
          {tr(
            "Mỗi khóa gọi thay mặt người tạo: người đó mất quyền hoặc nghỉ việc thì khóa cũng không đọc được dữ liệu nữa.",
          )}
        </p>
        <button type="button" className={smallPrimaryButtonClass} onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {tr("Tạo khóa")}
        </button>
      </div>

      <Table<ApiKey>
        rowKey="id"
        size="small"
        dataSource={keys}
        pagination={keys.length > 20 ? { pageSize: 20 } : false}
        scroll={{ x: 900 }}
        locale={{ emptyText: tr("Chưa có khóa API nào.") }}
        columns={[
          {
            title: tr("Khóa"),
            render: (_, k) => (
              <div className="min-w-0">
                <div className="font-medium text-ink">{k.name}</div>
                <code className="font-mono text-[11.5px] text-muted">{k.prefix}…</code>
              </div>
            ),
          },
          {
            title: tr("Phạm vi"),
            render: (_, k) => (
              <div className="flex flex-wrap gap-1">
                {k.scopes.map((s) => (
                  <Tag key={s} className="!m-0 font-mono !text-[11px]">
                    {s}
                  </Tag>
                ))}
                {k.allowed_ips.length > 0 && (
                  <Tag color="blue" className="!m-0 !text-[11px]">
                    {trf("{0} dải IP", [k.allowed_ips.length])}
                  </Tag>
                )}
              </div>
            ),
          },
          {
            title: tr("Trạng thái"),
            render: (_, k) => {
              const s = STATUS[statusOf(k)];
              return <Tag color={s.color}>{s.label}</Tag>;
            },
          },
          { title: tr("Hết hạn"), render: (_, k) => formatDate(k.expires_at) },
          {
            title: tr("Dùng gần nhất"),
            render: (_, k) =>
              k.last_used_at ? (
                <span>
                  {formatDate(k.last_used_at)}
                  {k.last_ip && <span className="block font-mono text-[11px] text-muted">{k.last_ip}</span>}
                </span>
              ) : (
                <span className="text-muted">{tr("Chưa dùng")}</span>
              ),
          },
          {
            title: tr("Lượt gọi 30 ngày"),
            align: "right",
            render: (_, k) => (
              <span className="tabular-nums">
                {sum(k, "calls").toLocaleString("en-US")}
                {sum(k, "errors") > 0 && (
                  <span className="block text-[11px] text-red-700">{trf("{0} lỗi", [sum(k, "errors")])}</span>
                )}
              </span>
            ),
          },
          { title: tr("Người tạo"), render: (_, k) => k.created_by_person?.full_name ?? "—" },
          {
            title: "",
            align: "right",
            render: (_, k) =>
              statusOf(k) === "active" ? (
                <button type="button" className={smallSecondaryButtonClass} onClick={() => revoke(k)}>
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  {tr("Thu hồi")}
                </button>
              ) : null,
          },
        ]}
      />

      <Modal
        open={creating}
        title={tr("Tạo khóa API")}
        okText={tr("Tạo khóa")}
        cancelText={tr("Hủy")}
        confirmLoading={saving}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<KeyInput>
          form={form}
          layout="vertical"
          initialValues={{ expires_days: 90, scopes: [], allowed_ips: [] }}
          onFinish={(v) => void submit(v)}
        >
          <Form.Item
            name="name"
            label={tr("Tên khóa")}
            rules={[
              { required: true, whitespace: true, max: 80, message: tr("Đặt tên để nhận ra hệ thống dùng khóa") },
            ]}
          >
            <Input placeholder={tr("Ví dụ: Kho dữ liệu BI phòng tài chính")} />
          </Form.Item>
          <Form.Item
            name="scopes"
            label={tr("Phạm vi")}
            rules={[{ required: true, type: "array", min: 1, message: tr("Chọn ít nhất một phạm vi") }]}
            extra={tr("Chỉ chọn phạm vi hệ thống bên ngoài thật sự cần.")}
          >
            <Checkbox.Group className="flex flex-col gap-1.5">
              {scopes.map((s) => (
                <Checkbox key={s.name} value={s.name}>
                  <span className="font-mono text-[12px]">{s.name}</span>{" "}
                  <span className="text-[12px] text-muted">· {s.label}</span>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>
          <Form.Item name="expires_days" label={tr("Hạn dùng")}>
            <Select options={EXPIRY.map((d) => ({ value: d, label: trf("{0} ngày", [d]) }))} />
          </Form.Item>
          <Form.Item
            name="allowed_ips"
            label={tr("Chỉ cho phép gọi từ (tùy chọn)")}
            extra={tr(
              "Địa chỉ IP hoặc dải CIDR, ví dụ 203.0.113.10 hoặc 10.0.0.0/8; bỏ trống thì gọi được từ mọi nơi.",
            )}
          >
            <Select mode="tags" tokenSeparators={[",", " "]} placeholder="203.0.113.10, 10.0.0.0/8" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={created != null}
        title={
          <span className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-bamboo-700" aria-hidden />
            {tr("Khóa API mới")}
          </span>
        }
        okText={tr("Tôi đã lưu khóa")}
        cancelButtonProps={{ style: { display: "none" } }}
        closable={false}
        maskClosable={false}
        onOk={() => setCreated(null)}
      >
        <Alert
          type="warning"
          showIcon
          message={tr(
            "Sao chép và cất khóa ở nơi an toàn ngay bây giờ: khóa chỉ hiện một lần, máy chủ chỉ lưu mã băm.",
          )}
        />
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">{created?.key}</code>
          <button
            type="button"
            className={smallSecondaryButtonClass}
            onClick={() => {
              if (!created) return;
              void copyText(created.key).then(() => message.success(tr("Đã sao chép khóa.")));
            }}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {tr("Sao chép")}
          </button>
        </div>
        {created && (
          <p className="m-0 mt-2 text-[12px] text-muted">{trf("Hết hạn {0}", [formatDate(created.expires_at)])}</p>
        )}
      </Modal>
    </div>
  );
};
