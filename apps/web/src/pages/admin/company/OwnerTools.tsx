// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Form, Input, Modal, Select, Typography } from "antd";
import { useEffect, useState } from "react";

import { request } from "../../../api/client";
import { useSession } from "../../../auth/useSession";
import { Panel } from "../../../components/ui/Panel";
import { secondaryButtonClass } from "../../../components/ui/buttons";

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

/** Việc chỉ chủ sở hữu làm: chuyển quyền chủ sở hữu, tạo công ty thành viên (ADR #57). */
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
      title: `Chuyển quyền chủ sở hữu cho ${person.full_name}?`,
      content:
        "Từ nay chỉ người này trao, thu hồi được quyền quản trị và cài/gỡ chức năng trên máy chủ; bạn mất các quyền đó. Mọi quản trị viên được thông báo. Việc này dùng khi đổi người đại diện theo pháp luật.",
      okText: "Chuyển quyền",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await request(`mutation Transfer($p: uuid!) { transfer_ownership(person_id: $p) { owner_name } }`, {
            p: person.id,
          });
          message.success(`Đã chuyển quyền chủ sở hữu cho ${person.full_name}.`);
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
        title: `Đã tạo công ty thành viên ${r.tenant_name}`,
        content: r.password ? (
          <p>
            Chủ sở hữu <Typography.Text code>{r.username}</Typography.Text>, mật khẩu tạm{" "}
            <Typography.Text code copyable>
              {r.password}
            </Typography.Text>{" "}
            (chỉ hiện một lần; lần đăng nhập đầu phải đổi mật khẩu và cài mã xác thực hai lớp).
          </p>
        ) : (
          <p>
            Tài khoản <Typography.Text code>{r.username}</Typography.Text> dùng chung với công ty mẹ: người này chọn
            công ty ở góc trên khi đăng nhập.
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
      <Panel title="Chuyển quyền chủ sở hữu">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Chọn người nhận (đã có tài khoản)"
            className="min-w-[320px]"
            value={target}
            onChange={setTarget}
            options={people.map((p) => ({
              value: p.id,
              label: p.employee_code ? `${p.full_name} · ${p.employee_code}` : p.full_name,
            }))}
          />
          <button type="button" className={secondaryButtonClass} disabled={!target} onClick={transfer}>
            Chuyển quyền
          </button>
        </div>
      </Panel>

      <Panel title="Công ty thành viên">
        <p className="mt-0 text-[13px] text-body">
          Tạo công ty con trực thuộc {tenant.tenant_name}. Công ty mới có chủ sở hữu riêng, chỉ có phần lõi; chủ sở hữu
          của nó tự bật chức năng cần dùng.
        </p>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(true)}>
          Tạo công ty thành viên
        </button>
      </Panel>

      <Modal
        open={open}
        title="Tạo công ty thành viên"
        okText="Tạo công ty"
        cancelText="Hủy"
        confirmLoading={busy}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={create}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item
              name="code"
              label="Mã công ty"
              normalize={(v: string) => v?.toUpperCase()}
              rules={[
                { required: true, message: "Nhập mã công ty" },
                { pattern: /^[A-Z][A-Z0-9_]{1,19}$/, message: "Chữ in hoa không dấu, số, gạch dưới; 2-20 ký tự" },
              ]}
            >
              <Input placeholder="ABC_SX" />
            </Form.Item>
            <Form.Item name="name" label="Tên hiển thị" rules={[{ required: true, message: "Nhập tên" }]}>
              <Input />
            </Form.Item>
          </div>
          <Typography.Text type="secondary" className="mb-2 block text-[12.5px]">
            Thông tin pháp lý (không bắt buộc; khai thì chủ sở hữu công ty thành viên ký số xác thực sau)
          </Typography.Text>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item
              name="tax_code"
              label="Mã số thuế"
              rules={[{ pattern: /^\d{10}(-\d{3})?$/, message: "10 chữ số, hoặc dạng 0101234567-001" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="legal_name" label="Tên doanh nghiệp">
              <Input />
            </Form.Item>
            <Form.Item name="address" label="Địa chỉ trụ sở">
              <Input />
            </Form.Item>
            <Form.Item name="legal_rep_name" label="Người đại diện theo pháp luật">
              <Input />
            </Form.Item>
          </div>
          <Typography.Text type="secondary" className="mb-2 block text-[12.5px]">
            Chủ sở hữu công ty thành viên (tên đăng nhập đã có ở công ty mẹ thì dùng chung tài khoản)
          </Typography.Text>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Form.Item
              name={["owner", "full_name"]}
              label="Họ tên"
              rules={[{ required: true, message: "Nhập họ tên" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name={["owner", "username"]}
              label="Tên đăng nhập"
              rules={[{ required: true, message: "Nhập tên đăng nhập" }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              name={["owner", "email"]}
              label="Email"
              rules={[{ type: "email", message: "Email không hợp lệ" }]}
            >
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
};
