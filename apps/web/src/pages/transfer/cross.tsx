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

import { useCallback, useEffect, useState } from "react";
import { CreateButton, Show, ShowButton, useTable } from "@refinedev/antd";
import { useGo, useParsed, type BaseRecord } from "@refinedev/core";
import { Alert, App, Button, Card, Col, Descriptions, Input, Row, Space, Spin, Steps, Table, Typography } from "antd";
import { AuditOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { Eye } from "lucide-react";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { StatusDot, StatusTag } from "../../components/StatusTag";
import { CellText, CellTitle, DotLabel, ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { formatDate, formatDay } from "../../utils/format";
import { REQUESTER_KIND, STAGE_LABEL, type CrossTransfer } from "./types";
import { TRO_CANCEL, TRO_DETAIL, TRO_LIST, TRO_SUBMIT, TR_MY_TASK_FOR } from "./queries";
import { tr as trl, trf } from "../../i18n";

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
  const total = tableProps.pagination ? tableProps.pagination.total : undefined;
  return (
    <ListPage>
      <ListPageHeader
        title={trl("Điều chuyển liên tập đoàn")}
        description={trl("Điều chuyển nhân sự sang công ty khác trong tập đoàn")}
        actions={
          <>
            <Button size="large" onClick={() => go({ to: "/h/transfer" })}>
              {trl("Điều chuyển nội bộ")}
            </Button>
            <CreateButton size="large" resource="hr_transfer_request">
              {trl("Lập đề nghị")}
            </CreateButton>
          </>
        }
      />
      <ListCard title={trl("Danh sách đề nghị")} meta={total !== undefined ? trf("{0} đề nghị", [total]) : undefined}>
        <Table {...tableProps} rowKey="id" className="list-table" scroll={{ x: 820 }}>
          <Table.Column<Row>
            title={trl("Nhân viên")}
            render={(_, r) => <CellTitle title={r.person_name} sub={r.doc_no} />}
          />
          <Table.Column<Row> title={trl("Đơn vị nơi đến")} render={(_, r) => <CellText main={r.target_unit_name} />} />
          <Table.Column
            dataIndex="effective_date"
            title={trl("Ngày chuyển")}
            responsive={["md"]}
            render={(v: string) => <span className="whitespace-nowrap tabular-nums text-body">{formatDay(v)}</span>}
          />
          <Table.Column<Row>
            title={trl("Đang ở")}
            render={(_, r) =>
              r.status === "PENDING" ? (
                <DotLabel dot="bg-amber-500" label={STAGE_LABEL[r.stage]} />
              ) : (
                <StatusDot status={r.status} />
              )
            }
          />
          <Table.Column<Row>
            title={trl("Người lập")}
            responsive={["lg"]}
            render={(_, r) => <CellText main={r.requester?.full_name ?? "—"} sub={formatDate(r.created_at)} />}
          />
          <Table.Column<Row>
            title={<span className="sr-only">{trl("Thao tác")}</span>}
            align="right"
            width={56}
            render={(_, r) => (
              <ShowButton
                hideText
                type="text"
                shape="circle"
                icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
                recordItemId={r.id}
                aria-label={trf("Xem {0}", [r.doc_no])}
              />
            )}
          />
        </Table>
      </ListCard>
    </ListPage>
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
    return <Alert type="warning" showIcon message={trl("Không tìm thấy đề nghị hoặc bạn không có quyền xem.")} />;

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
      title: trf("Hủy đề nghị {0}?", [tr.doc_no]),
      content: (
        <Input.TextArea
          rows={3}
          placeholder={trl("Lý do hủy (bắt buộc)")}
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: trl("Hủy đề nghị"),
      okButtonProps: { danger: true },
      cancelText: trl("Không"),
      onOk: async () => {
        if (!reason.trim()) {
          message.error(trl("Phải ghi lý do hủy"));
          throw new Error("missing reason");
        }
        await run(TRO_CANCEL, { id: tr.id, reason: reason.trim() }, trl("Đã hủy đề nghị"));
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
              {trl("Xử lý duyệt")}
            </Button>
          )}
          {submittable && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => run(TRO_SUBMIT, { id: tr.id }, trl("Đã gửi duyệt"))}
            >
              {trl("Gửi duyệt")}
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              {trl("Hủy")}
            </Button>
          )}
        </Space>
      )}
    >
      {returnedNote && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={trl("Bị trả về")}
          description={returnedNote}
        />
      )}
      {tr.status === "APPROVED" && (
        <Alert
          style={{ marginBottom: 16 }}
          type="success"
          showIcon
          message={trf("Đã điều chuyển {0} đến {1} từ {2}", [
            tr.person_name,
            tr.target_unit_name,
            formatDay(tr.effective_date),
          ])}
        />
      )}
      <Card title={trl("Tiến trình")}>
        <Steps
          size="small"
          current={current}
          status={tr.status === "REJECTED" || tr.status === "CANCELLED" ? "error" : undefined}
          items={STAGES.map((s) => ({ title: STAGE_LABEL[s] }))}
        />
        {(tr.status === "REJECTED" || tr.status === "CANCELLED") && (
          <Typography.Paragraph style={{ marginTop: 12 }} type="secondary">
            {trl("Đề nghị đã ")} {tr.status === "REJECTED" ? trl("bị từ chối") : trl("bị hủy")}
            {trl("; nhân viên giữ nguyên vị trí cũ.")}
          </Typography.Paragraph>
        )}
      </Card>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={COLUMNS} title={trf("Điều chuyển {0}", [tr.person_name])}>
            <Descriptions.Item label={trl("Vị trí hiện tại")}>
              {tr.source_position?.name}, {tr.source_position?.org_unit.name}
            </Descriptions.Item>
            <Descriptions.Item label={trl("Đơn vị nơi đến")}>{tr.target_unit_name}</Descriptions.Item>
            <Descriptions.Item label={trl("Ngày chuyển")}>{formatDay(tr.effective_date)}</Descriptions.Item>
            <Descriptions.Item label={trl("Người lập")}>
              {tr.requester?.full_name} – {tr.requester_position?.name}
              <br />
              {REQUESTER_KIND[tr.requester_kind]}
            </Descriptions.Item>
            <Descriptions.Item label={trl("Lý do / nguyện vọng")} span={2}>
              {tr.reason}
            </Descriptions.Item>
          </Descriptions>
        </Col>
        <Col xs={24} xl={9}>
          <ApprovalPanel
            round={tr.approval_round}
            steps={tr.approval_steps}
            history={tr.approval_history}
            emptyHint={trl("Chưa gửi duyệt. Bước 1: quản lý trực tiếp; bước 2: HR của công ty nguồn.")}
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={trf("Xử lý {0}", [tr.doc_no])}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
    </Show>
  );
};
