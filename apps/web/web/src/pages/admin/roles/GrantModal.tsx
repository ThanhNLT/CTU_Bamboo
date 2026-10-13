// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { DatePicker, Form, Radio, Select, TreeSelect } from "antd";
import type { Dayjs } from "dayjs";
import { adminSave } from "../shared/api";
import { FormModal } from "../shared/FormModal";
import { SCOPE_LABEL, type OrgData } from "../shared/orgData";
import { useUnitTree } from "../shared/useUnitTree";
import { toDate } from "../shared/period";

type Target = "position" | "org_unit" | "person";
type Values = {
  target: Target; position_id?: string; org_unit_id?: string; person_id?: string;
  scope: string; scope_unit_id?: string; valid_from?: Dayjs; valid_to?: Dayjs;
};

/**
 * Cấp vai trò. Mặc định cho VỊ TRÍ (ai ngồi ghế thì có quyền, ADR #5); cho cả đơn vị = mọi vị trí trong đơn vị;
 * cho người chỉ dành cho người ngoài cây tổ chức và bắt buộc có hạn (CSDL chặn nếu người đó đang giữ ghế).
 */
export const GrantModal = ({
  open, org, roleId, roleName, onClose, onSaved,
}: {
  open: boolean;
  org: OrgData;
  roleId: string;
  roleName: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const tree = useUnitTree(org);
  const positions = org.positions.filter((p) => p.period.active).map((p) => ({
    value: p.id, label: `${p.name} · ${org.unitPath(p.org_unit_id)}${p.holder ? ` — ${p.holder.person.full_name}` : " — (trống)"}`,
  }));
  return (
    <FormModal<Values>
      open={open}
      title={`Cấp vai trò ${roleName}`}
      okText="Cấp vai trò"
      width={600}
      initial={{ target: "position", scope: "SUBTREE" }}
      onCancel={onClose}
      onSubmit={async (v) => {
        await adminSave("role_grant", {
          role_id: roleId,
          position_id: v.target === "position" ? v.position_id : null,
          org_unit_id: v.target === "org_unit" ? v.org_unit_id : null,
          person_id: v.target === "person" ? v.person_id : null,
          scope: v.scope, scope_unit_id: v.scope_unit_id ?? null,
          valid_from: toDate(v.valid_from), valid_to: toDate(v.valid_to),
        });
        onSaved();
      }}
    >
      {(form) => (
        <>
          <Form.Item name="target" label="Cấp cho" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={[
              { value: "position", label: "Một vị trí" },
              { value: "org_unit", label: "Mọi vị trí trong đơn vị" },
              { value: "person", label: "Người ngoài cây tổ chức" },
            ]} />
          </Form.Item>
          <Form.Item noStyle dependencies={["target"]}>
            {() => {
              const t = form.getFieldValue("target") as Target;
              if (t === "position") {
                return (
                  <Form.Item name="position_id" label="Vị trí" rules={[{ required: true, message: "Chọn vị trí" }]}
                             extra="Người được bổ nhiệm vào ghế sau này tự có quyền; người rời ghế tự mất quyền.">
                    <Select showSearch optionFilterProp="label" options={positions} />
                  </Form.Item>
                );
              }
              if (t === "org_unit") {
                return (
                  <Form.Item name="org_unit_id" label="Đơn vị" rules={[{ required: true, message: "Chọn đơn vị" }]}>
                    <TreeSelect treeData={tree} showSearch treeNodeFilterProp="title" />
                  </Form.Item>
                );
              }
              return (
                <Form.Item name="person_id" label="Người" rules={[{ required: true, message: "Chọn người" }]}
                           extra="Chỉ cho người không giữ ghế nào (kiểm toán viên ngoài, quản trị nền tảng…). Bắt buộc có ngày kết thúc.">
                  <Select showSearch optionFilterProp="label"
                          options={org.people.map((p) => ({ value: p.id, label: p.employee_code ? `${p.full_name} · ${p.employee_code}` : p.full_name }))} />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="scope" label="Phạm vi áp dụng" rules={[{ required: true }]}>
            <Radio.Group className="flex flex-col gap-1.5"
                         options={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item noStyle dependencies={["scope"]}>
            {() => ["SUBTREE", "UNIT"].includes(form.getFieldValue("scope")) && (
              <Form.Item name="scope_unit_id" label="Neo phạm vi tại đơn vị"
                         extra="Bỏ trống: neo tại đơn vị của vị trí / đơn vị được cấp.">
                <TreeSelect allowClear treeData={tree} showSearch treeNodeFilterProp="title" />
              </Form.Item>
            )}
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="valid_from" label="Từ ngày" extra="Bỏ trống: từ bây giờ">
              <DatePicker format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
            <Form.Item noStyle dependencies={["target"]}>
              {() => (
                <Form.Item name="valid_to" label="Đến ngày"
                           rules={[{ required: form.getFieldValue("target") === "person", message: "Cấp cho người phải có hạn" }]}>
                  <DatePicker format="DD/MM/YYYY" className="w-full" />
                </Form.Item>
              )}
            </Form.Item>
          </div>
        </>
      )}
    </FormModal>
  );
};
