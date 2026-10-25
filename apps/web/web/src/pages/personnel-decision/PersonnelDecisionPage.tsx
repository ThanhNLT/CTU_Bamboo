// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, DatePicker, Form, Input, Modal, Radio, Select, Spin, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { primaryButtonClass, secondaryButtonClass } from "../../components/ui";
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

const TYPE_LABEL: Record<DecisionType, string> = {
  APPOINT: "Bổ nhiệm",
  TRANSFER: "Điều chuyển",
  DISMISS: "Miễn nhiệm",
};
const TYPE_COLOR: Record<DecisionType, string> = { APPOINT: "green", TRANSFER: "blue", DISMISS: "volcano" };
const KIND_LABEL: Record<AssignmentKind, string> = {
  PRIMARY: "Giữ chính",
  CONCURRENT: "Kiêm nhiệm",
  ACTING: "Quyền trưởng",
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
          label: `${p.name} – ${p.unit}${p.holder ? ` · đang có: ${p.holder}` : " · trống"}`,
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
      message.success(`Đã ban hành quyết định ${r.doc_no}.`);
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
      title="Ban hành quyết định nhân sự"
      okText="Ban hành"
      cancelText="Hủy"
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
        <Form.Item name="decisionType" label="Loại quyết định">
          <Radio.Group
            optionType="button"
            options={(Object.keys(TYPE_LABEL) as DecisionType[]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))}
          />
        </Form.Item>
        <Form.Item name="personId" label="Nhân sự" rules={[{ required: true, message: "Chọn nhân sự" }]}>
          <Select
            aria-label="Nhân sự"
            showSearch
            optionFilterProp="label"
            placeholder="Gõ tên hoặc mã nhân viên"
            options={people.map((p) => ({
              value: p.id,
              label: `${p.full_name}${p.employee_code ? ` (${p.employee_code})` : ""}${
                p.assignments[0] ? ` – ${p.assignments[0].position}` : " – chưa có vị trí"
              }`,
            }))}
          />
        </Form.Item>
        {type === "APPOINT" && (
          <Form.Item name="assignmentType" label="Hình thức bổ nhiệm">
            <Radio.Group
              options={[
                { value: "CONCURRENT", label: "Kiêm nhiệm" },
                { value: "ACTING", label: "Quyền trưởng (vị trí trưởng đang trống)" },
                { value: "PRIMARY", label: "Giữ chính (người chưa có vị trí)" },
              ]}
            />
          </Form.Item>
        )}
        {type !== "APPOINT" && (
          <Form.Item
            name="sourcePositionId"
            label={type === "TRANSFER" ? "Vị trí hiện tại (giữ chính)" : "Bổ nhiệm bị miễn (kiêm nhiệm / quyền trưởng)"}
            rules={[{ required: true, message: "Chọn vị trí" }]}
            extra={personId && sourceOptions.length === 0 ? "Người này không có bổ nhiệm phù hợp." : undefined}
          >
            <Select aria-label="Vị trí hiện tại" options={sourceOptions} placeholder="Chọn nhân sự trước" />
          </Form.Item>
        )}
        {type !== "DISMISS" && (
          <Form.Item
            name="targetPositionId"
            label={type === "TRANSFER" ? "Vị trí mới" : "Vị trí bổ nhiệm"}
            rules={[{ required: true, message: "Chọn vị trí" }]}
            extra="Vị trí phải còn trống vào ngày hiệu lực."
          >
            <Select
              aria-label="Vị trí mới"
              showSearch
              optionFilterProp="label"
              options={targetOptions}
              placeholder="Gõ tên vị trí hoặc đơn vị"
            />
          </Form.Item>
        )}
        <Form.Item
          name="effectiveDate"
          label="Ngày hiệu lực"
          rules={[{ required: true, message: "Chọn ngày" }]}
          initialValue={dayjs()}
        >
          <DatePicker
            style={{ width: "100%" }}
            format="DD/MM/YYYY"
            disabledDate={(d) => d.isBefore(dayjs().startOf("day"))}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="Căn cứ / lý do"
          rules={[{ required: true, whitespace: true, message: "Ghi căn cứ quyết định" }]}
        >
          <Input.TextArea rows={3} maxLength={2000} showCount />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Quyết định có hiệu lực ngay theo ngày chọn, không qua chuỗi duyệt, gửi thông báo cho nhân sự và không sửa hoặc
          xóa được sau khi ban hành.
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
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Quyết định nhân sự</h1>
          <p className="mt-1 text-[13px] text-muted">
            Bổ nhiệm, điều chuyển, miễn nhiệm do Tổng giám đốc hoặc Phó tổng giám đốc ban hành.
          </p>
        </div>
        {data.canIssue && (
          <button type="button" className={primaryButtonClass} onClick={() => void openIssue()}>
            Ban hành quyết định
          </button>
        )}
      </div>

      <Table<Decision>
        rowKey="id"
        dataSource={data.decisions}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: "Chưa có quyết định nào." }}
        columns={[
          { title: "Số quyết định", dataIndex: "doc_no", width: 150 },
          {
            title: "Loại",
            dataIndex: "decision_type",
            width: 130,
            render: (t: DecisionType, r) => (
              <Tag color={TYPE_COLOR[t]}>
                {TYPE_LABEL[t]}
                {t === "APPOINT" ? ` · ${KIND_LABEL[r.assignment_type]}` : ""}
              </Tag>
            ),
          },
          {
            title: "Nhân sự",
            dataIndex: "person_name",
            render: (n: string, r) => `${n}${r.employee_code ? ` (${r.employee_code})` : ""}`,
          },
          {
            title: "Từ",
            render: (_: unknown, r) => (r.source_position ? `${r.source_position} – ${r.source_unit}` : "—"),
          },
          {
            title: "Đến",
            render: (_: unknown, r) => (r.target_position ? `${r.target_position} – ${r.target_unit}` : "—"),
          },
          { title: "Hiệu lực", dataIndex: "effective_date", width: 110, render: (d: string) => formatDay(d) },
          { title: "Người ban hành", dataIndex: "issuer_name" },
          {
            title: "",
            width: 100,
            render: (_: unknown, r) => (
              <button
                type="button"
                className={secondaryButtonClass}
                aria-label={`In quyết định ${r.doc_no}`}
                onClick={() =>
                  void decisionPdf(r.id)
                    .then((pdf) => window.location.assign(pdf.url))
                    .catch((e: Error) => message.error(e.message))
                }
              >
                In PDF
              </button>
            ),
          },
        ]}
        expandable={{ expandedRowRender: (r) => <Typography.Text>Căn cứ: {r.reason}</Typography.Text> }}
      />

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
