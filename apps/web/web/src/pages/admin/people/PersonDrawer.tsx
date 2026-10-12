// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Button, Checkbox, Drawer, Form, Input } from "antd";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Dot, smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui";
import { adminSave, createAccounts, type AccountResult } from "../shared/api";
import { ASSIGNMENT_LABEL, assignmentsOf, type Assignment, type OrgData, type Person, type Position } from "../shared/orgData";
import { periodLabel } from "../shared/period";

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="mb-2.5 mt-6 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted first:mt-0">{children}</h3>
);

/** Ngăn chi tiết người dùng: sửa thông tin, tạo tài khoản đăng nhập, bổ nhiệm / kết thúc bổ nhiệm. */
export const PersonDrawer = ({
  person, org, onClose, onChanged, onAssign, onEndAssignment, onAccounts,
}: {
  person?: Person;
  org: OrgData;
  onClose: () => void;
  onChanged: () => void;
  onAssign: (personId: string) => void;
  onEndAssignment: (a: Assignment, p: Position) => void;
  onAccounts: (results: AccountResult[]) => void;
}) => {
  const { message } = App.useApp();
  const [info] = Form.useForm<{ full_name: string; employee_code?: string }>();
  const [account] = Form.useForm<{ username: string; email?: string; link_existing?: boolean }>();
  const [busy, setBusy] = useState<"info" | "account">();

  useEffect(() => {
    if (!person) return;
    info.setFieldsValue({ full_name: person.full_name, employee_code: person.employee_code ?? undefined });
    account.resetFields();
  }, [person, info, account]);

  if (!person) return <Drawer open={false} onClose={onClose} />;
  const list = assignmentsOf(org, person.id);

  const saveInfo = async () => {
    const v = await info.validateFields();
    setBusy("info");
    try {
      await adminSave("person", { id: person.id, ...v, employee_code: v.employee_code?.trim() || null });
      message.success("Đã lưu thông tin.");
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const createAccount = async () => {
    const v = await account.validateFields();
    setBusy("account");
    try {
      const [r] = await createAccounts([{ person_id: person.id, username: v.username.trim(), email: v.email?.trim() || null, link_existing: v.link_existing }]);
      if (r.error) message.error(r.error);
      else {
        onAccounts([r]);
        onChanged();
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Drawer open title={person.full_name} width={480} onClose={onClose} destroyOnHidden>
      <SectionTitle>Thông tin</SectionTitle>
      <Form form={info} name="personInfo" layout="vertical" requiredMark="optional">
        <Form.Item name="full_name" label="Họ tên" rules={[{ required: true, whitespace: true, message: "Nhập họ tên" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="employee_code" label="Mã nhân viên" extra="Duy nhất trong tenant; dùng khi nhập từ Excel.">
          <Input className="font-mono" />
        </Form.Item>
        <Button onClick={() => void saveInfo()} loading={busy === "info"}>Lưu thông tin</Button>
      </Form>

      <SectionTitle>Tài khoản đăng nhập</SectionTitle>
      {person.idp_subject ? (
        <p className="flex items-center gap-2 text-[13px] text-body">
          <ShieldCheck className="h-4 w-4 text-bamboo-600" strokeWidth={1.75} aria-hidden />
          Đã có tài khoản (đăng nhập qua Keycloak, bắt buộc MFA theo chính sách realm).
        </p>
      ) : (
        <Form form={account} name="personAccount" layout="vertical" requiredMark="optional">
          <p className="mb-3 text-[12.5px] text-muted">Chưa có tài khoản. Tạo mới với mật khẩu tạm (đổi ở lần đăng nhập đầu), hoặc liên kết tài khoản người này đã có ở công ty khác trong tập đoàn.</p>
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="username" label="Tên đăng nhập"
                       rules={[{ required: true, pattern: /^[a-z0-9._-]{3,}$/i, message: "Ít nhất 3 ký tự: chữ không dấu, số, . _ -" }]}>
              <Input className="font-mono" placeholder="an.nv" />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Email không hợp lệ" }]}>
              <Input placeholder="an.nv@congty.vn" />
            </Form.Item>
          </div>
          <Form.Item name="link_existing" valuePropName="checked" className="mb-3">
            <Checkbox>Liên kết tài khoản đã có (không tạo mới)</Checkbox>
          </Form.Item>
          <button type="button" className={smallPrimaryButtonClass} onClick={() => void createAccount()} disabled={busy === "account"}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden /> {busy === "account" ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </Form>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Bổ nhiệm</h3>
        <button type="button" className={smallSecondaryButtonClass} onClick={() => onAssign(person.id)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Bổ nhiệm
        </button>
      </div>
      {list.length === 0 && <p className="mt-2 text-[12.5px] text-muted">Chưa giữ vị trí nào — chưa có quyền theo vị trí.</p>}
      <ul className="m-0 mt-2 list-none space-y-2 p-0">
        {list.map(({ a, p }) => (
          <li key={a.id} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
            <Dot tone={a.period.active ? "success" : "neutral"} size="md" className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">{p.name}</div>
              <div className="text-[11.5px] text-muted">{org.unitPath(p.org_unit_id)}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                {ASSIGNMENT_LABEL[a.assignment_type]} · {periodLabel(a.period)}{a.contract_no ? ` · HĐ ${a.contract_no}` : ""}
              </div>
            </div>
            {a.period.active && (
              <button type="button" className={smallSecondaryButtonClass} onClick={() => onEndAssignment(a, p)}>Kết thúc</button>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
};
