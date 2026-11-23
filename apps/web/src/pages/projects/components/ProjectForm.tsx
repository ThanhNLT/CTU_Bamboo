/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { App, DatePicker, Form, Input, InputNumber, Modal, Select, TreeSelect } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

import { request } from "../../../api/client";
import { tr } from "../../../i18n";
import { searchPeople } from "../../chat/api";
import { fetchUnits, type Unit } from "../../work-calendar/api";
import { saveProject, STATUS_LABEL } from "../api";
import type { Project, ProjectStatus } from "../types";

type Values = {
  code: string;
  name: string;
  org_unit_id: string;
  manager_id: string;
  status: ProjectStatus;
  range: [Dayjs, Dayjs];
  budget?: number | null;
  objective?: string;
  scope?: string;
  deliverables?: string;
  approach?: string;
  risks?: string;
  stakeholders?: string;
};

const unitTree = (units: Unit[]) => {
  type Node = { value: string; title: string; children: Node[] };
  const byLabel = new Map<string, Node>();
  const roots: Node[] = [];
  for (const u of [...units].sort((a, b) => a.path.split(".").length - b.path.split(".").length)) {
    const labels = u.path.split(".");
    const node: Node = { value: u.id, title: u.name, children: [] };
    byLabel.set(labels.at(-1)!, node);
    const parent = labels.length > 1 ? byLabel.get(labels.at(-2)!) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
};

export const ProjectForm = ({
  open,
  me,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  me: { id: string; name: string };
  initial?: Project | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const tree = useMemo(() => unitTree(units), [units]);

  useEffect(() => {
    if (!open) return;
    void fetchUnits().then(setUnits);
    if (initial) {
      form.setFieldsValue({
        ...initial,
        range: [dayjs(initial.start_date), dayjs(initial.end_date)],
        budget: initial.budget ?? undefined,
        objective: initial.objective ?? undefined,
        scope: initial.scope ?? undefined,
        deliverables: initial.deliverables ?? undefined,
        approach: initial.approach ?? undefined,
        risks: initial.risks ?? undefined,
        stakeholders: initial.stakeholders ?? undefined,
      });
      setPeople([{ value: initial.manager_id, label: initial.manager_name }]);
    } else {
      form.resetFields();
      form.setFieldsValue({ status: "PLANNING", manager_id: me.id, range: [dayjs(), dayjs().add(3, "month")] });
      setPeople([{ value: me.id, label: me.name }]);
      void request<{ core_assignment: { position: { org_unit_id: string } }[] }>(
        `query($p: uuid!) { core_assignment(where: {person_id: {_eq: $p}}, limit: 1) { position { org_unit_id } } }`,
        { p: me.id },
      )
        .then(
          (r) => r.core_assignment[0] && form.setFieldValue("org_unit_id", r.core_assignment[0].position.org_unit_id),
        )
        .catch(() => undefined);
    }
  }, [open, initial, form, me.id, me.name]);

  const findPeople = (q: string) =>
    void searchPeople(q, "00000000-0000-0000-0000-000000000000").then((rows) =>
      setPeople(rows.map((r) => ({ value: r.id, label: r.full_name }))),
    );

  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try {
      const id = await saveProject({
        id: initial?.id,
        code: v.code.trim().toUpperCase(),
        name: v.name,
        org_unit_id: v.org_unit_id,
        manager_id: v.manager_id,
        status: v.status,
        start_date: v.range[0].format("YYYY-MM-DD"),
        end_date: v.range[1].format("YYYY-MM-DD"),
        budget: v.budget ?? null,
        objective: v.objective || null,
        scope: v.scope || null,
        deliverables: v.deliverables || null,
        approach: v.approach || null,
        risks: v.risks || null,
        stakeholders: v.stakeholders || null,
      });
      message.success(initial ? tr("Đã lưu dự án") : tr("Đã lập dự án"));
      onSaved(id);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const area = (name: keyof Values, label: string, placeholder: string) => (
    <Form.Item name={name} label={label}>
      <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={8000} placeholder={placeholder} />
    </Form.Item>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={initial ? tr("Lưu") : tr("Lập dự án")}
      cancelText={tr("Hủy")}
      confirmLoading={busy}
      title={initial ? tr("Sửa dự án và kế hoạch") : tr("Dự án mới")}
      width={760}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} className="mt-3">
        <div className="grid gap-x-4 sm:grid-cols-[160px_1fr]">
          <Form.Item
            name="code"
            label={tr("Mã dự án")}
            rules={[
              { required: true, message: tr("Cần mã dự án") },
              { pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/, message: tr("2–20 ký tự chữ, số, gạch nối") },
            ]}
          >
            <Input placeholder="ERP-2027" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="name"
            label={tr("Tên dự án")}
            rules={[{ required: true, whitespace: true, message: tr("Cần tên dự án") }]}
          >
            <Input maxLength={200} />
          </Form.Item>
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item
            name="org_unit_id"
            label={tr("Đơn vị chủ trì")}
            rules={[{ required: true, message: tr("Chọn đơn vị") }]}
          >
            <TreeSelect treeData={tree} showSearch treeNodeFilterProp="title" treeDefaultExpandAll />
          </Form.Item>
          <Form.Item name="manager_id" label={tr("Người quản lý dự án")} rules={[{ required: true }]}>
            <Select showSearch filterOption={false} onSearch={findPeople} options={people} />
          </Form.Item>
          <Form.Item
            name="range"
            label={tr("Thời gian thực hiện")}
            rules={[{ required: true, message: tr("Chọn thời gian") }]}
          >
            <DatePicker.RangePicker className="w-full" format="DD-MMM-YYYY" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="status" label={tr("Trạng thái")}>
              <Select
                options={(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                }))}
              />
            </Form.Item>
            <Form.Item name="budget" label={tr("Ngân sách (đồng)")}>
              <InputNumber<number>
                className="w-full"
                min={0}
                step={1000000}
                formatter={(v) => (v == null ? "" : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
                parser={(v) => Number((v ?? "").replace(/,/g, "")) || 0}
              />
            </Form.Item>
          </div>
        </div>
        <h3 className="mb-2 mt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
          {tr("Văn bản kế hoạch chi tiết")}
        </h3>
        {area("objective", tr("Mục tiêu"), tr("Dự án đạt được gì, đo bằng chỉ số nào"))}
        {area("scope", tr("Phạm vi"), tr("Làm những gì, không làm những gì"))}
        {area("deliverables", tr("Sản phẩm bàn giao"), tr("Kết quả cụ thể, tiêu chí nghiệm thu"))}
        {area("approach", tr("Phương pháp triển khai"), tr("Các giai đoạn, cách tổ chức, nguồn lực"))}
        {area("risks", tr("Rủi ro và biện pháp"), tr("Mỗi dòng một rủi ro và cách xử lý"))}
        {area("stakeholders", tr("Các bên liên quan"), tr("Đơn vị, đối tác phối hợp, người phê duyệt"))}
      </Form>
    </Modal>
  );
};
