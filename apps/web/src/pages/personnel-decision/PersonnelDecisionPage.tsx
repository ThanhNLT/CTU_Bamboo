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

import { App, DatePicker, Form, Input, Modal, Radio, Select, Spin, Table, Typography } from "antd";
import dayjs from "dayjs";
import { Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CellText, CellTitle, DotLabel, iconActionClass, ListCard, primaryButtonClass } from "../../components/ui";
import { formatDay } from "../../utils/format";
import {
  decisionContext,
  decisionPdf,
  issueDecision,
  listDecisions,
  type AssignmentKind,
  type Decision,
  type DecisionType,
  type PersonOption,
  type PositionOption,
} from "./api";
import { tr, trf } from "../../i18n";

const TYPE_LABEL: Record<DecisionType, string> = {
  APPOINT: tr("Bổ nhiệm"),
  TRANSFER: tr("Điều chuyển"),
  DISMISS: tr("Miễn nhiệm"),
};
const TYPE_DOT: Record<DecisionType, string> = {
  APPOINT: "bg-bamboo-500",
  TRANSFER: "bg-sky-500",
  DISMISS: "bg-orange-500",
};
const KIND_LABEL: Record<AssignmentKind, string> = {
  PRIMARY: tr("Giữ chính"),
  CONCURRENT: tr("Kiêm nhiệm"),
  ACTING: tr("Quyền trưởng"),
};

type FormValues = {
  decisionType: DecisionType;
  personId: string;
  sourcePositionId?: string;
  targetPositionId?: string;
  assignmentType: AssignmentKind;
  effectiveDate: dayjs.Dayjs;
  reason: string;
};

const IssueModal = ({
  open,
  people,
  positions,
  onClose,
  onDone,
}: {
  open: boolean;
  people: PersonOption[];
  positions: PositionOption[];
  onClose: () => void;
  onDone: () => void;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [busy, setBusy] = useState(false);
  const type = Form.useWatch("decisionType", form) ?? "TRANSFER";
  const personId = Form.useWatch("personId", form);
  const kind = Form.useWatch("assignmentType", form) ?? "CONCURRENT";
  const person = useMemo(() => people.find((p) => p.id === personId), [people, personId]);

  const sourceOptions = useMemo(
    () =>
      (person?.assignments ?? [])
        .filter((a) => (type === "TRANSFER" ? a.type === "PRIMARY" : a.type !== "PRIMARY"))
        .map((a) => ({ value: a.position_id, label: `${a.position} – ${a.unit} (${KIND_LABEL[a.type]})` })),
    [person, type],
  );
  const targetOptions = useMemo(
    () =>
      positions
        .filter((p) => (type === "APPOINT" && kind === "ACTING" ? p.is_head : true))
        .map((p) => ({
          value: p.id,
          label: `${p.name} – ${p.unit}${p.holder ? trf(" · đang có: {0}", [p.holder]) : tr(" · trống")}`,
        })),
    [positions, type, kind],
  );

  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try {
      const r = await issueDecision({
        decisionType: v.decisionType,
        personId: v.personId,
        sourcePositionId: v.decisionType === "APPOINT" ? undefined : v.sourcePositionId,
        targetPositionId: v.decisionType === "DISMISS" ? undefined : v.targetPositionId,
        assignmentType: v.decisionType === "APPOINT" ? v.assignmentType : undefined,
        effectiveDate: v.effectiveDate.format("YYYY-MM-DD"),
        reason: v.reason,
      });
      message.success(trf("Đã ban hành quyết định {0}.", [r.doc_no]));
      form.resetFields();
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={tr("Ban hành quyết định nhân sự")}
      okText={tr("Ban hành")}
      cancelText={tr("Hủy")}
      onOk={() => void submit()}
      okButtonProps={{ loading: busy }}
      onCancel={onClose}
      destroyOnHidden
      width={640}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={{ decisionType: "TRANSFER", assignmentType: "CONCURRENT" }}
        onValuesChange={(changed) => {
          if ("decisionType" in changed || "personId" in changed)
            form.setFieldsValue({ sourcePositionId: undefined, targetPositionId: undefined });
        }}
      >
        <Form.Item name="decisionType" label={tr("Loại quyết định")}>
          <Radio.Group
            optionType="button"
            options={(Object.keys(TYPE_LABEL) as DecisionType[]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))}
          />
        </Form.Item>
        <Form.Item name="personId" label={tr("Nhân sự")} rules={[{ required: true, message: tr("Chọn nhân sự") }]}>
          <Select
            aria-label={tr("Nhân sự")}
            showSearch
            optionFilterProp="label"
            placeholder={tr("Gõ tên hoặc mã nhân viên")}
            options={people.map((p) => ({
              value: p.id,
              label: `${p.full_name}${p.employee_code ? ` (${p.employee_code})` : ""}${
                p.assignments[0] ? ` – ${p.assignments[0].position}` : tr(" – chưa có vị trí")
              }`,
            }))}
          />
        </Form.Item>
        {type === "APPOINT" && (
          <Form.Item name="assignmentType" label={tr("Hình thức bổ nhiệm")}>
            <Radio.Group
              options={[
                { value: "CONCURRENT", label: tr("Kiêm nhiệm") },
                { value: "ACTING", label: tr("Quyền trưởng (vị trí trưởng đang trống)") },
                { value: "PRIMARY", label: tr("Giữ chính (người chưa có vị trí)") },
              ]}
            />
          </Form.Item>
        )}
        {type !== "APPOINT" && (
          <Form.Item
            name="sourcePositionId"
            label={
              type === "TRANSFER"
                ? tr("Vị trí hiện tại (giữ chính)")
                : tr("Bổ nhiệm bị miễn (kiêm nhiệm / quyền trưởng)")
            }
            rules={[{ required: true, message: tr("Chọn vị trí") }]}
            extra={personId && sourceOptions.length === 0 ? tr("Người này không có bổ nhiệm phù hợp.") : undefined}
          >
            <Select aria-label={tr("Vị trí hiện tại")} options={sourceOptions} placeholder={tr("Chọn nhân sự trước")} />
          </Form.Item>
        )}
        {type !== "DISMISS" && (
          <Form.Item
            name="targetPositionId"
            label={type === "TRANSFER" ? tr("Vị trí mới") : tr("Vị trí bổ nhiệm")}
            rules={[{ required: true, message: tr("Chọn vị trí") }]}
            extra={tr("Vị trí phải còn trống vào ngày hiệu lực.")}
          >
            <Select
              aria-label={tr("Vị trí mới")}
              showSearch
              optionFilterProp="label"
              options={targetOptions}
              placeholder={tr("Gõ tên vị trí hoặc đơn vị")}
            />
          </Form.Item>
        )}
        <Form.Item
          name="effectiveDate"
          label={tr("Ngày hiệu lực")}
          rules={[{ required: true, message: tr("Chọn ngày") }]}
          initialValue={dayjs()}
        >
          <DatePicker
            style={{ width: "100%" }}
            format="DD-MMM-YYYY"
            disabledDate={(d) => d.isBefore(dayjs().startOf("day"))}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label={tr("Căn cứ / lý do")}
          rules={[{ required: true, whitespace: true, message: tr("Ghi căn cứ quyết định") }]}
        >
          <Input.TextArea rows={3} maxLength={2000} showCount />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {tr(
            "Quyết định có hiệu lực ngay theo ngày chọn, không qua chuỗi duyệt, gửi thông báo cho nhân sự và không sửa hoặc xóa được sau khi ban hành.",
          )}
        </Typography.Paragraph>
      </Form>
    </Modal>
  );
};

export const PersonnelDecisionPage = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<{ canIssue: boolean; decisions: Decision[] }>();
  const [ctx, setCtx] = useState<{ people: PersonOption[]; positions: PositionOption[] }>();
  const [open, setOpen] = useState(false);

  const load = useCallback(
    () =>
      listDecisions()
        .then((r) => setData({ canIssue: r.can_issue, decisions: r.decisions }))
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const openIssue = async () => {
    try {
      setCtx(await decisionContext());
      setOpen(true);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  if (!data) return <Spin className="mt-24 block" />;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {tr("Quyết định nhân sự")}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {tr("Bổ nhiệm, điều chuyển, miễn nhiệm do Tổng giám đốc hoặc Phó tổng giám đốc ban hành.")}
          </p>
        </div>
        {data.canIssue && (
          <button type="button" className={primaryButtonClass} onClick={() => void openIssue()}>
            {tr("Ban hành quyết định")}
          </button>
        )}
      </div>

      <ListCard title={tr("Quyết định đã ban hành")} meta={trf("{0} quyết định", [data.decisions.length])}>
        <Table<Decision>
          rowKey="id"
          className="list-table"
          dataSource={data.decisions}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: tr("Chưa có quyết định nào.") }}
          columns={[
            {
              title: tr("Nhân sự"),
              dataIndex: "person_name",
              render: (n: string, r) => (
                <CellTitle title={n} sub={[r.doc_no, r.employee_code].filter(Boolean).join(" · ")} />
              ),
            },
            {
              title: tr("Loại"),
              dataIndex: "decision_type",
              render: (t: DecisionType, r) => (
                <DotLabel
                  dot={TYPE_DOT[t]}
                  label={`${TYPE_LABEL[t]}${t === "APPOINT" ? ` · ${KIND_LABEL[r.assignment_type]}` : ""}`}
                />
              ),
            },
            {
              title: tr("Từ"),
              render: (_: unknown, r) =>
                r.source_position ? (
                  <CellText main={r.source_position} sub={r.source_unit} />
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
            {
              title: tr("Đến"),
              render: (_: unknown, r) =>
                r.target_position ? (
                  <CellText main={r.target_position} sub={r.target_unit} />
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
            {
              title: tr("Hiệu lực"),
              dataIndex: "effective_date",
              render: (d: string) => <span className="whitespace-nowrap tabular-nums text-body">{formatDay(d)}</span>,
            },
            {
              title: tr("Người ban hành"),
              dataIndex: "issuer_name",
              render: (n: string) => <CellText main={n} />,
            },
            {
              title: <span className="sr-only">{tr("Thao tác")}</span>,
              align: "right",
              width: 56,
              render: (_: unknown, r) => (
                <span className="flex justify-end">
                  <button
                    type="button"
                    className={iconActionClass}
                    aria-label={trf("In quyết định {0}", [r.doc_no])}
                    title={tr("In PDF")}
                    onClick={() =>
                      void decisionPdf(r.id)
                        .then((pdf) => window.location.assign(pdf.url))
                        .catch((e: Error) => message.error(e.message))
                    }
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (r) => (
              <Typography.Text>
                {tr("Căn cứ: ")} {r.reason}
              </Typography.Text>
            ),
          }}
        />
      </ListCard>

      {ctx && (
        <IssueModal
          open={open}
          people={ctx.people}
          positions={ctx.positions}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
};

export default PersonnelDecisionPage;
