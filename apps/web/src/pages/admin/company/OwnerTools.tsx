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

import { App, Form, Input, Modal, Select, Typography } from "antd";
import { useEffect, useState } from "react";

import { request } from "../../../api/client";
import { useSession } from "../../../auth/useSession";
import { Panel } from "../../../components/ui/Panel";
import { secondaryButtonClass } from "../../../components/ui/buttons";
import { tr, trf } from "../../../i18n";

type Person = { id: string; full_name: string; employee_code: string | null };

type Subsidiary = {
  code: string;
  name: string;
  tax_code?: string;
  legal_name?: string;
  address?: string;
  legal_rep_name?: string;
  owner: { username: string; full_name: string; email?: string };
};

const PEOPLE = `query OwnerCandidates {
  core_person(where: {idp_subject: {_is_null: false}, assignments: {valid_period: {_is_null: false}}}, order_by: {full_name: asc}) {
    id full_name employee_code
  }
}`;

const CREATE = `mutation CreateSubsidiary($code: String!, $name: String!, $tax_code: String, $legal_name: String,
  $address: String, $legal_rep_name: String, $owner: SubsidiaryOwnerInput!) {
  create_subsidiary(code: $code, name: $name, tax_code: $tax_code, legal_name: $legal_name, address: $address,
    legal_rep_name: $legal_rep_name, owner: $owner) { tenant_code tenant_name username password }
}`;

export const OwnerTools = ({ onTransferred }: { onTransferred: () => void }) => {
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [target, setTarget] = useState<string>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<Subsidiary>();

  useEffect(() => {
    request<{ core_person: Person[] }>(PEOPLE)
      .then((r) => setPeople(r.core_person.filter((p) => p.id !== tenant.person_id)))
      .catch((e: Error) => message.error(e.message));
  }, [message, tenant.person_id]);

  const transfer = () => {
    const person = people.find((p) => p.id === target);
    if (!person) return;
    modal.confirm({
      title: trf("Chuyển quyền chủ sở hữu cho {0}?", [person.full_name]),
      content: tr(
        "Từ nay chỉ người này trao, thu hồi được quyền quản trị và cài/gỡ chức năng trên máy chủ; bạn mất các quyền đó. Mọi quản trị viên được thông báo. Việc này dùng khi đổi người đại diện theo pháp luật.",
      ),
      okText: tr("Chuyển quyền"),
      okButtonProps: { danger: true },
      cancelText: tr("Hủy"),
      onOk: async () => {
        try {
          await request(`mutation Transfer($p: uuid!) { transfer_ownership(person_id: $p) { owner_name } }`, {
            p: person.id,
          });
          message.success(trf("Đã chuyển quyền chủ sở hữu cho {0}.", [person.full_name]));
          onTransferred();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const create = async (v: Subsidiary) => {
    setBusy(true);
    try {
      const { create_subsidiary: r } = await request<{
        create_subsidiary: { tenant_name: string; username: string; password: string | null };
      }>(CREATE, { ...v, tax_code: v.tax_code || null });
      setOpen(false);
      form.resetFields();
      modal.success({
        title: trf("Đã tạo công ty thành viên {0}", [r.tenant_name]),
        content: r.password ? (
          <p>
            {tr("Chủ sở hữu ")} <Typography.Text code>{r.username}</Typography.Text>
            {tr(", mật khẩu tạm")}{" "}
            <Typography.Text code copyable>
              {r.password}
            </Typography.Text>{" "}
            {tr("(chỉ hiện một lần; lần đăng nhập đầu phải đổi mật khẩu và cài mã xác thực hai lớp).")}
          </p>
        ) : (
          <p>
            {tr("Tài khoản ")} <Typography.Text code>{r.username}</Typography.Text>{" "}
            {tr(" dùng chung với công ty mẹ: người này chọn công ty ở góc trên khi đăng nhập.")}
          </p>
        ),
      });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel title={tr("Chuyển quyền chủ sở hữu")}>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={tr("Chọn người nhận (đã có tài khoản)")}
            className="min-w-[320px]"
            value={target}
            onChange={setTarget}
            options={people.map((p) => ({
              value: p.id,
              label: p.employee_code ? `${p.full_name} · ${p.employee_code}` : p.full_name,
            }))}
          />
          <button type="button" className={secondaryButtonClass} disabled={!target} onClick={transfer}>
            {tr("Chuyển quyền")}
          </button>
        </div>
      </Panel>

      <Panel title={tr("Công ty thành viên")}>
        <p className="mt-0 text-[13px] text-body">
          {tr("Tạo công ty con trực thuộc ")} {tenant.tenant_name}
          {tr(". Công ty mới có chủ sở hữu riêng, chỉ có phần lõi; chủ sở hữu của nó tự bật chức năng cần dùng.")}
        </p>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(true)}>
          {tr("Tạo công ty thành viên")}
        </button>
      </Panel>

      <Modal
        open={open}
        title={tr("Tạo công ty thành viên")}
        okText={tr("Tạo công ty")}
        cancelText={tr("Hủy")}
        confirmLoading={busy}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={create}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item
              name="code"
              label={tr("Mã công ty")}
              normalize={(v: string) => v?.toUpperCase()}
              rules={[
                { required: true, message: tr("Nhập mã công ty") },
                { pattern: /^[A-Z][A-Z0-9_]{1,19}$/, message: tr("Chữ in hoa không dấu, số, gạch dưới; 2-20 ký tự") },
              ]}
            >
              <Input placeholder="ABC_SX" />
            </Form.Item>
            <Form.Item name="name" label={tr("Tên hiển thị")} rules={[{ required: true, message: tr("Nhập tên") }]}>
              <Input />
            </Form.Item>
          </div>
          <Typography.Text type="secondary" className="mb-2 block text-[12.5px]">
            {tr("Thông tin pháp lý (không bắt buộc; khai thì chủ sở hữu công ty thành viên ký số xác thực sau)")}
          </Typography.Text>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item
              name="tax_code"
              label={tr("Mã số thuế")}
              rules={[{ pattern: /^\d{10}(-\d{3})?$/, message: tr("10 chữ số, hoặc dạng 0101234567-001") }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="legal_name" label={tr("Tên doanh nghiệp")}>
              <Input />
            </Form.Item>
            <Form.Item name="address" label={tr("Địa chỉ trụ sở")}>
              <Input />
            </Form.Item>
            <Form.Item name="legal_rep_name" label={tr("Người đại diện theo pháp luật")}>
              <Input />
            </Form.Item>
          </div>
          <Typography.Text type="secondary" className="mb-2 block text-[12.5px]">
            {tr("Chủ sở hữu công ty thành viên (tên đăng nhập đã có ở công ty mẹ thì dùng chung tài khoản)")}
          </Typography.Text>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Form.Item
              name={["owner", "full_name"]}
              label={tr("Họ tên")}
              rules={[{ required: true, message: tr("Nhập họ tên") }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name={["owner", "username"]}
              label={tr("Tên đăng nhập")}
              rules={[{ required: true, message: tr("Nhập tên đăng nhập") }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              name={["owner", "email"]}
              label="Email"
              rules={[{ type: "email", message: tr("Email không hợp lệ") }]}
            >
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
};
