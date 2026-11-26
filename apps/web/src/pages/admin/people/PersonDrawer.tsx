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

import { App, Button, Checkbox, Drawer, Form, Input } from "antd";
import { KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Dot, smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui";
import { adminSave, createAccounts, deletePerson, type AccountResult } from "../shared/api";
import {
  ASSIGNMENT_LABEL,
  assignmentsOf,
  type Assignment,
  type OrgData,
  type Person,
  type Position,
} from "../shared/orgData";
import { periodLabel } from "../shared/period";
import { tr, trf } from "../../../i18n";

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="mb-2.5 mt-6 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted first:mt-0">
    {children}
  </h3>
);

export const PersonDrawer = ({
  person,
  org,
  onClose,
  onChanged,
  onAssign,
  onEndAssignment,
  onAccounts,
  onDeleted,
}: {
  person?: Person;
  org: OrgData;
  onClose: () => void;
  onChanged: () => void;
  onAssign: (personId: string) => void;
  onEndAssignment: (a: Assignment, p: Position) => void;
  onAccounts: (results: AccountResult[]) => void;
  onDeleted: () => void;
}) => {
  const { message, modal } = App.useApp();
  const [info] = Form.useForm<{ full_name: string; employee_code?: string }>();
  const [account] = Form.useForm<{ username: string; email?: string; link_existing?: boolean }>();
  const [busy, setBusy] = useState<"info" | "account" | "delete">();

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
      message.success(tr("Đã lưu thông tin."));
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
      const [r] = await createAccounts([
        {
          person_id: person.id,
          username: v.username.trim(),
          email: v.email?.trim() || null,
          link_existing: v.link_existing,
        },
      ]);
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

  const holding = list.some(({ a }) => a.period.active);
  const remove = () =>
    modal.confirm({
      title: trf("Xóa hẳn {0}?", [person.full_name]),
      content: tr(
        "Chỉ xóa được người chưa có dữ liệu nghiệp vụ (chứng từ, duyệt, tệp, nhật ký…). Lịch sử bổ nhiệm đã kết thúc và cấp quyền riêng của người này bị xóa theo; tài khoản đăng nhập bị vô hiệu hóa nếu không còn dùng ở công ty khác trong tập đoàn.",
      ),
      okText: tr("Xóa hẳn"),
      okButtonProps: { danger: true },
      cancelText: tr("Không"),
      onOk: async () => {
        setBusy("delete");
        try {
          const account = await deletePerson(person.id);
          message.success(
            account === "disabled"
              ? tr("Đã xóa người và vô hiệu hóa tài khoản đăng nhập.")
              : account === "kept"
                ? tr("Đã xóa người; tài khoản vẫn dùng ở công ty khác trong tập đoàn.")
                : tr("Đã xóa người."),
          );
          onDeleted();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(undefined);
        }
      },
    });

  return (
    <Drawer open title={person.full_name} width={480} onClose={onClose} destroyOnHidden>
      <SectionTitle>{tr("Thông tin")}</SectionTitle>
      <Form form={info} name="personInfo" layout="vertical" requiredMark="optional">
        <Form.Item
          name="full_name"
          label={tr("Họ tên")}
          rules={[{ required: true, whitespace: true, message: tr("Nhập họ tên") }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="employee_code"
          label={tr("Mã nhân viên")}
          extra={tr("Duy nhất trong tenant; dùng khi nhập từ Excel.")}
        >
          <Input className="font-mono" />
        </Form.Item>
        <Button onClick={() => void saveInfo()} loading={busy === "info"}>
          {tr("Lưu thông tin")}
        </Button>
      </Form>

      <SectionTitle>{tr("Tài khoản đăng nhập")}</SectionTitle>
      {person.idp_subject ? (
        <p className="flex items-center gap-2 text-[13px] text-body">
          <ShieldCheck className="h-4 w-4 text-bamboo-600" strokeWidth={1.75} aria-hidden />
          {tr("Đã có tài khoản (đăng nhập qua Keycloak, bắt buộc MFA theo chính sách realm).")}
        </p>
      ) : (
        <Form form={account} name="personAccount" layout="vertical" requiredMark="optional">
          <p className="mb-3 text-[12.5px] text-muted">
            {tr(
              "Chưa có tài khoản. Tạo mới với mật khẩu tạm (đổi ở lần đăng nhập đầu), hoặc liên kết tài khoản người này đã có ở công ty khác trong tập đoàn.",
            )}
          </p>
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item
              name="username"
              label={tr("Tên đăng nhập")}
              rules={[
                {
                  required: true,
                  pattern: /^[a-z0-9._-]{3,}$/i,
                  message: tr("Ít nhất 3 ký tự: chữ không dấu, số, . _ -"),
                },
              ]}
            >
              <Input className="font-mono" placeholder="an.nv" />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ type: "email", message: tr("Email không hợp lệ") }]}>
              <Input placeholder="an.nv@congty.vn" />
            </Form.Item>
          </div>
          <Form.Item name="link_existing" valuePropName="checked" className="mb-3">
            <Checkbox>{tr("Liên kết tài khoản đã có (không tạo mới)")}</Checkbox>
          </Form.Item>
          <button
            type="button"
            className={smallPrimaryButtonClass}
            onClick={() => void createAccount()}
            disabled={busy === "account"}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />{" "}
            {busy === "account" ? tr("Đang tạo…") : tr("Tạo tài khoản")}
          </button>
        </Form>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr("Bổ nhiệm")}</h3>
        <button type="button" className={smallSecondaryButtonClass} onClick={() => onAssign(person.id)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> {tr(" Bổ nhiệm")}
        </button>
      </div>
      {list.length === 0 && (
        <p className="mt-2 text-[12.5px] text-muted">{tr("Chưa giữ vị trí nào — chưa có quyền theo vị trí.")}</p>
      )}
      <ul className="m-0 mt-2 list-none flex flex-col gap-2 p-0">
        {list.map(({ a, p }) => (
          <li key={a.id} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
            <Dot tone={a.period.active ? "success" : "neutral"} size="md" className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">{p.name}</div>
              <div className="text-[11.5px] text-muted">{org.unitPath(p.org_unit_id)}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                {ASSIGNMENT_LABEL[a.assignment_type]} · {periodLabel(a.period)}
                {a.contract_no ? trf(" · HĐ {0}", [a.contract_no]) : ""}
              </div>
            </div>
            {a.period.active && (
              <button type="button" className={smallSecondaryButtonClass} onClick={() => onEndAssignment(a, p)}>
                {tr("Kết thúc")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <SectionTitle>{tr("Xóa người")}</SectionTitle>
      <p className="mb-3 text-[12.5px] text-muted">
        {holding
          ? tr("Người này còn giữ vị trí: kết thúc bổ nhiệm trước khi xóa.")
          : tr(
              "Dùng khi thêm nhầm. Người đã có dữ liệu nghiệp vụ không xóa được, chỉ kết thúc bổ nhiệm để ngừng hoạt động.",
            )}
      </p>
      <Button
        danger
        icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
        disabled={holding}
        loading={busy === "delete"}
        onClick={remove}
      >
        {tr("Xóa người")}
      </Button>
    </Drawer>
  );
};
