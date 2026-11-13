/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { DatePicker, Form, Radio, Select, TreeSelect } from "antd";
import type { Dayjs } from "dayjs";

import { adminSave } from "../shared/api";
import { FormModal } from "../shared/FormModal";
import { SCOPE_LABEL, type OrgData } from "../shared/orgData";
import { useUnitTree } from "../shared/useUnitTree";
import { toDate } from "../shared/period";
import { tr, trf } from "../../../i18n";

type Target = "position" | "org_unit" | "person";
type Values = {
  target: Target;
  position_id?: string;
  org_unit_id?: string;
  person_id?: string;
  scope: string;
  scope_unit_id?: string;
  valid_from?: Dayjs;
  valid_to?: Dayjs;
};

export const GrantModal = ({
  open,
  org,
  roleId,
  roleName,
  onClose,
  onSaved,
}: {
  open: boolean;
  org: OrgData;
  roleId: string;
  roleName: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const tree = useUnitTree(org);
  const positions = org.positions
    .filter((p) => p.period.active)
    .map((p) => ({
      value: p.id,
      label: `${p.name} · ${org.unitPath(p.org_unit_id)}${p.holder ? ` — ${p.holder.person.full_name}` : tr(" — (trống)")}`,
    }));
  return (
    <FormModal<Values>
      open={open}
      title={trf("Cấp vai trò {0}", [roleName])}
      okText={tr("Cấp vai trò")}
      width={600}
      initial={{ target: "position", scope: "SUBTREE" }}
      onCancel={onClose}
      onSubmit={async (v) => {
        await adminSave("role_grant", {
          role_id: roleId,
          position_id: v.target === "position" ? v.position_id : null,
          org_unit_id: v.target === "org_unit" ? v.org_unit_id : null,
          person_id: v.target === "person" ? v.person_id : null,
          scope: v.scope,
          scope_unit_id: v.scope_unit_id ?? null,
          valid_from: toDate(v.valid_from),
          valid_to: toDate(v.valid_to),
        });
        onSaved();
      }}
    >
      {(form) => (
        <>
          <Form.Item name="target" label={tr("Cấp cho")} rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: "position", label: tr("Một vị trí") },
                { value: "org_unit", label: tr("Mọi vị trí trong đơn vị") },
                { value: "person", label: tr("Người ngoài cây tổ chức") },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle dependencies={["target"]}>
            {() => {
              const t = form.getFieldValue("target") as Target;
              if (t === "position") {
                return (
                  <Form.Item
                    name="position_id"
                    label={tr("Vị trí")}
                    rules={[{ required: true, message: tr("Chọn vị trí") }]}
                    extra={tr("Người được bổ nhiệm vào ghế sau này tự có quyền; người rời ghế tự mất quyền.")}
                  >
                    <Select showSearch optionFilterProp="label" options={positions} />
                  </Form.Item>
                );
              }
              if (t === "org_unit") {
                return (
                  <Form.Item
                    name="org_unit_id"
                    label={tr("Đơn vị")}
                    rules={[{ required: true, message: tr("Chọn đơn vị") }]}
                  >
                    <TreeSelect treeData={tree} showSearch treeNodeFilterProp="title" />
                  </Form.Item>
                );
              }
              return (
                <Form.Item
                  name="person_id"
                  label={tr("Người")}
                  rules={[{ required: true, message: tr("Chọn người") }]}
                  extra={tr(
                    "Chỉ cho người không giữ ghế nào (kiểm toán viên ngoài, quản trị nền tảng…). Bắt buộc có ngày kết thúc.",
                  )}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={org.people.map((p) => ({
                      value: p.id,
                      label: p.employee_code ? `${p.full_name} · ${p.employee_code}` : p.full_name,
                    }))}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="scope" label={tr("Phạm vi áp dụng")} rules={[{ required: true }]}>
            <Radio.Group
              className="flex flex-col gap-1.5"
              options={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item noStyle dependencies={["scope"]}>
            {() =>
              ["SUBTREE", "UNIT"].includes(form.getFieldValue("scope")) && (
                <Form.Item
                  name="scope_unit_id"
                  label={tr("Neo phạm vi tại đơn vị")}
                  extra={tr("Bỏ trống: neo tại đơn vị của vị trí / đơn vị được cấp.")}
                >
                  <TreeSelect allowClear treeData={tree} showSearch treeNodeFilterProp="title" />
                </Form.Item>
              )
            }
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="valid_from" label={tr("Từ ngày")} extra={tr("Bỏ trống: từ bây giờ")}>
              <DatePicker format="DD-MMM-YYYY" className="w-full" />
            </Form.Item>
            <Form.Item noStyle dependencies={["target"]}>
              {() => (
                <Form.Item
                  name="valid_to"
                  label={tr("Đến ngày")}
                  rules={[
                    { required: form.getFieldValue("target") === "person", message: tr("Cấp cho người phải có hạn") },
                  ]}
                >
                  <DatePicker format="DD-MMM-YYYY" className="w-full" />
                </Form.Item>
              )}
            </Form.Item>
          </div>
        </>
      )}
    </FormModal>
  );
};
