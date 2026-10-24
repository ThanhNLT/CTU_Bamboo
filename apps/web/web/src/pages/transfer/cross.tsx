// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { CreateButton, List, Show, ShowButton, useTable } from "@refinedev/antd";
import { useGo, useParsed, type BaseRecord } from "@refinedev/core";
import { Alert, App, Button, Card, Col, Descriptions, Input, Row, Space, Spin, Steps, Table, Typography } from "antd";
import { AuditOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatDay } from "../../utils/format";
import { REQUESTER_KIND, STAGE_LABEL, type CrossTransfer } from "./types";
import { TRO_CANCEL, TRO_DETAIL, TRO_LIST, TRO_SUBMIT, TR_MY_TASK_FOR } from "./queries";

const COLUMNS = { xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 };
const STAGES = ["SOURCE", "TARGET", "GROUP", "DONE"] as const;

type Row = BaseRecord & {
  doc_no: string;
  status: string;
  stage: string;
  person_name: string;
  target_unit_name: string;
  effective_date: string;
  created_at: string;
  requester?: { full_name: string };
};

export const CrossTransferList = () => {
  const go = useGo();
  const { tableProps } = useTable<Row>({
    resource: "hr_transfer_out",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { gqlQuery: TRO_LIST },
    liveMode: "auto",
  });
  return (
    <List
      title="Điều chuyển liên tập đoàn"
      headerButtons={
        <Space>
          <Button onClick={() => go({ to: "/h/transfer" })}>Điều chuyển nội bộ</Button>
          <CreateButton resource="hr_transfer_request">Lập đề nghị</CreateButton>
        </Space>
      }
    >
      <Table {...tableProps} rowKey="id" scroll={{ x: 720 }}>
        <Table.Column
          dataIndex="doc_no"
          title="Số"
          render={(v: string) => (
            <Typography.Text code style={{ whiteSpace: "nowrap" }}>
              {v}
            </Typography.Text>
          )}
        />
        <Table.Column dataIndex="person_name" title="Nhân viên" />
        <Table.Column dataIndex="target_unit_name" title="Đơn vị nơi đến" />
        <Table.Column dataIndex="effective_date" title="Ngày chuyển" render={formatDay} responsive={["md"]} />
        <Table.Column<Row>
          title="Đang ở"
          render={(_, r) => (r.status === "PENDING" ? STAGE_LABEL[r.stage] : <StatusTag status={r.status} />)}
        />
        <Table.Column dataIndex={["requester", "full_name"]} title="Người lập" responsive={["lg"]} />
        <Table.Column dataIndex="created_at" title="Ngày lập" render={formatDate} responsive={["lg"]} />
        <Table.Column<Row> title="" render={(_, r) => <ShowButton hideText size="small" recordItemId={r.id} />} />
      </Table>
    </List>
  );
};

export const CrossTransferShow = () => {
  const { id } = useParsed();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [tr, setTr] = useState<CrossTransfer | null>();
  const [task, setTask] = useState<{ task_id: string; via_delegation: boolean } | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        request<{ hr_transfer_out_by_pk: CrossTransfer | null }>(TRO_DETAIL, { id }),
        request<{ wf_v_inbox: { task_id: string; via_delegation: boolean }[] }>(TR_MY_TASK_FOR, { id }),
      ]);
      setTr(d.hr_transfer_out_by_pk);
      setTask(t.wf_v_inbox[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (tr === undefined) return <Spin />;
  if (tr === null)
    return <Alert type="warning" showIcon message="Không tìm thấy đề nghị hoặc bạn không có quyền xem." />;

  const mine = tr.requester_id === tenant.person_id;
  const submittable = mine && ["DRAFT", "RETURNED"].includes(tr.status);
  const cancellable = mine && ["DRAFT", "PENDING", "RETURNED"].includes(tr.status) && tr.stage === "SOURCE";
  const returnedNote =
    tr.status === "RETURNED"
      ? tr.approval_steps.find((s) => s.round === tr.approval_round && s.status === "RETURNED")?.note
      : null;
  const current = tr.status === "PENDING" ? STAGES.indexOf(tr.stage as (typeof STAGES)[number]) : STAGES.length - 1;

  const run = async (doc: string, vars: Record<string, unknown>, ok: string) => {
    try {
      await request(doc, vars);
      message.success(ok);
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const cancel = () => {
    let reason = "";
    modal.confirm({
      title: `Hủy đề nghị ${tr.doc_no}?`,
      content: (
        <Input.TextArea
          rows={3}
          placeholder="Lý do hủy (bắt buộc)"
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: "Hủy đề nghị",
      okButtonProps: { danger: true },
      cancelText: "Không",
      onOk: async () => {
        if (!reason.trim()) {
          message.error("Phải ghi lý do hủy");
          throw new Error("missing reason");
        }
        await run(TRO_CANCEL, { id: tr.id, reason: reason.trim() }, "Đã hủy đề nghị");
      },
    });
  };

  return (
    <Show
      title={
        <Space>
          {tr.doc_no}
          <StatusTag status={tr.status} />
        </Space>
      }
      headerButtons={() => (
        <Space wrap>
          {task && (
            <Button type="primary" icon={<AuditOutlined />} onClick={() => setActing(true)}>
              Xử lý duyệt
            </Button>
          )}
          {submittable && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => run(TRO_SUBMIT, { id: tr.id }, "Đã gửi duyệt")}
            >
              Gửi duyệt
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              Hủy
            </Button>
          )}
        </Space>
      )}
    >
      {returnedNote && (
        <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Bị trả về" description={returnedNote} />
      )}
      {tr.status === "APPROVED" && (
        <Alert
          style={{ marginBottom: 16 }}
          type="success"
          showIcon
          message={`Đã điều chuyển ${tr.person_name} đến ${tr.target_unit_name} từ ${formatDay(tr.effective_date)}`}
        />
      )}
      <Card title="Tiến trình">
        <Steps
          size="small"
          current={current}
          status={tr.status === "REJECTED" || tr.status === "CANCELLED" ? "error" : undefined}
          items={STAGES.map((s) => ({ title: STAGE_LABEL[s] }))}
        />
        {(tr.status === "REJECTED" || tr.status === "CANCELLED") && (
          <Typography.Paragraph style={{ marginTop: 12 }} type="secondary">
            Đề nghị đã {tr.status === "REJECTED" ? "bị từ chối" : "bị hủy"}; nhân viên giữ nguyên vị trí cũ.
          </Typography.Paragraph>
        )}
      </Card>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={COLUMNS} title={`Điều chuyển ${tr.person_name}`}>
            <Descriptions.Item label="Vị trí hiện tại">
              {tr.source_position?.name}, {tr.source_position?.org_unit.name}
            </Descriptions.Item>
            <Descriptions.Item label="Đơn vị nơi đến">{tr.target_unit_name}</Descriptions.Item>
            <Descriptions.Item label="Ngày chuyển">{formatDay(tr.effective_date)}</Descriptions.Item>
            <Descriptions.Item label="Người lập">
              {tr.requester?.full_name} – {tr.requester_position?.name}
              <br />
              {REQUESTER_KIND[tr.requester_kind]}
            </Descriptions.Item>
            <Descriptions.Item label="Lý do / nguyện vọng" span={2}>
              {tr.reason}
            </Descriptions.Item>
          </Descriptions>
        </Col>
        <Col xs={24} xl={9}>
          <ApprovalPanel
            round={tr.approval_round}
            steps={tr.approval_steps}
            history={tr.approval_history}
            emptyHint="Chưa gửi duyệt. Bước 1: quản lý trực tiếp; bước 2: HR của công ty nguồn."
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={`Xử lý ${tr.doc_no}`}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
    </Show>
  );
};
