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

import { App, Button, InputNumber, Segmented, Select, Table } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";
import { ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { tr, trf } from "../../i18n";
import { formatMoney } from "../../utils/format";

type Rule = {
  key: number;
  min_amount: number;
  max_amount: number | null;
  step_order: number;
  approver_unit_type: string | null;
};

type RulesData = {
  process_code: string;
  can_manage: boolean;
  rules: { min_amount: string; max_amount: string | null; step_order: number; approver_unit_type: string | null }[];
  unit_types: { code: string; name: string }[];
};

const PROCESSES = [
  { value: "PURCHASE_REQUEST", label: tr("Đề nghị mua sắm") },
  { value: "ONBOARDING", label: tr("Tiếp nhận nhân sự") },
  { value: "KB_DOCUMENT", label: tr("Tài liệu tri thức") },
];

const money = {
  formatter: (v?: number | string) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, "."),
  parser: (v?: string) => Number((v ?? "").replace(/\./g, "")),
};

let seq = 0;
const toRows = (d: RulesData): Rule[] =>
  d.rules.map((r) => ({
    key: ++seq,
    min_amount: Number(r.min_amount),
    max_amount: r.max_amount === null ? null : Number(r.max_amount),
    step_order: r.step_order,
    approver_unit_type: r.approver_unit_type,
  }));

export const ApprovalRulesPage = () => {
  const { message } = App.useApp();
  const [process, setProcess] = useState("PURCHASE_REQUEST");
  const [data, setData] = useState<RulesData>();
  const [rows, setRows] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    (code: string) =>
      request<{ approval_rules: { data: RulesData } }>(
        `query ApprovalRules($p: String!) { approval_rules(process_code: $p) { data } }`,
        { p: code },
      )
        .then((r) => {
          setData(r.approval_rules.data);
          setRows(toRows(r.approval_rules.data));
        })
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  useEffect(() => void load(process), [load, process]);

  const update = (key: number, patch: Partial<Rule>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const r = await request<{ save_approval_rules: { data: RulesData } }>(
        `mutation SaveApprovalRules($p: String!, $r: jsonb!) { save_approval_rules(process_code: $p, rules: $r) { data } }`,
        {
          p: process,
          r: rows.map((r) => ({
            min_amount: r.min_amount,
            max_amount: r.max_amount,
            step_order: r.step_order,
            approver_unit_type: r.approver_unit_type,
          })),
        },
      );
      setData(r.save_approval_rules.data);
      setRows(toRows(r.save_approval_rules.data));
      message.success(tr("Đã lưu quy tắc hạn mức duyệt; chứng từ gửi duyệt từ bây giờ áp dụng quy tắc mới"));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const editable = Boolean(data?.can_manage);
  const types = (data?.unit_types ?? []).map((t) => ({ value: t.code, label: t.name }));

  return (
    <ListPage>
      <ListPageHeader
        title={tr("Hạn mức duyệt")}
        description={tr(
          "Theo giá trị chứng từ, mỗi bước duyệt do quản lý trực tiếp hoặc người đứng đầu đơn vị cấp trên theo loại đơn vị",
        )}
        actions={
          editable && (
            <Button type="primary" loading={saving} onClick={() => void save()}>
              {tr("Lưu quy tắc")}
            </Button>
          )
        }
      />
      <ListCard
        title={tr("Quy tắc đang áp dụng")}
        meta={editable ? undefined : tr("Chỉ xem: cần quyền wf.approval_rule.manage để sửa")}
        toolbar={<Segmented value={process} options={PROCESSES} onChange={(v) => setProcess(v as string)} />}
      >
        <Table<Rule> rowKey="key" dataSource={rows} pagination={false} className="list-table" scroll={{ x: 760 }}>
          <Table.Column<Rule>
            title={tr("Từ (đồng)")}
            render={(_, r) =>
              editable ? (
                <InputNumber
                  aria-label={tr("Giá trị từ")}
                  min={0}
                  value={r.min_amount}
                  onChange={(v) => update(r.key, { min_amount: Number(v ?? 0) })}
                  {...money}
                  className="w-44"
                />
              ) : (
                formatMoney(r.min_amount)
              )
            }
          />
          <Table.Column<Rule>
            title={tr("Đến dưới (đồng)")}
            render={(_, r) =>
              editable ? (
                <InputNumber
                  aria-label={tr("Giá trị đến dưới")}
                  min={0}
                  placeholder={tr("Không giới hạn")}
                  value={r.max_amount}
                  onChange={(v) => update(r.key, { max_amount: v === null ? null : Number(v) })}
                  {...money}
                  className="w-44"
                />
              ) : r.max_amount === null ? (
                tr("Không giới hạn")
              ) : (
                formatMoney(r.max_amount)
              )
            }
          />
          <Table.Column<Rule>
            title={tr("Bước")}
            width={90}
            render={(_, r) =>
              editable ? (
                <InputNumber
                  aria-label={tr("Bước duyệt")}
                  min={1}
                  max={9}
                  value={r.step_order}
                  onChange={(v) => update(r.key, { step_order: Number(v ?? 1) })}
                />
              ) : (
                r.step_order
              )
            }
          />
          <Table.Column<Rule>
            title={tr("Người duyệt")}
            render={(_, r) =>
              editable ? (
                <Select
                  aria-label={tr("Người duyệt")}
                  className="w-60"
                  allowClear
                  placeholder={tr("Quản lý trực tiếp")}
                  value={r.approver_unit_type ?? undefined}
                  onChange={(v) => update(r.key, { approver_unit_type: v ?? null })}
                  options={types}
                />
              ) : r.approver_unit_type ? (
                trf("Người đứng đầu {0}", [
                  types.find((t) => t.value === r.approver_unit_type)?.label ?? r.approver_unit_type,
                ])
              ) : (
                tr("Quản lý trực tiếp")
              )
            }
          />
          {editable && (
            <Table.Column<Rule>
              title={<span className="sr-only">{tr("Thao tác")}</span>}
              width={56}
              render={(_, r) => (
                <Button
                  type="text"
                  shape="circle"
                  aria-label={tr("Xóa quy tắc")}
                  icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                />
              )}
            />
          )}
        </Table>
        {editable && (
          <Button
            className="mt-3"
            icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  key: ++seq,
                  min_amount: rs.reduce((m, r) => Math.max(m, r.max_amount ?? r.min_amount), 0),
                  max_amount: null,
                  step_order: 1,
                  approver_unit_type: null,
                },
              ])
            }
          >
            {tr("Thêm quy tắc")}
          </Button>
        )}
      </ListCard>
    </ListPage>
  );
};
