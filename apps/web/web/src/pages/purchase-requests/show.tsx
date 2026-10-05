// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { Show } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
import {
  Alert, App, Button, Card, Col, Descriptions, Input, Modal, Row, Space, Spin, Steps, Table, Tabs, Tag, Timeline, Typography,
} from "antd";
import { ApartmentOutlined, AuditOutlined, EditOutlined, PrinterOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { request } from "../../api/client";
import { useSession } from "../../auth/session";
import { ActModal } from "../../components/approval/ActModal";
import {
  ESCALATION_REASON, formatDate, formatDay, formatMoney, HISTORY_EVENT, STEP_STATUS,
} from "../../utils/format";
import { StatusTag } from "../../components/StatusTag";
import { Attachments } from "./attachments";
import { Comments } from "./comments";
import { CANCEL_PR, MY_TASK_FOR, PR_DETAIL, PR_PDF, SUBMIT_PR } from "./queries";
import type { PurchaseRequest } from "./types";

const stepState = (s: string): "wait" | "process" | "finish" | "error" =>
  s === "ACTIVE" ? "process" : s === "APPROVED" ? "finish" : s === "REJECTED" || s === "RETURNED" ? "error" : "wait";

export const PurchaseRequestShow = () => {
  const { id } = useParsed();
  const go = useGo();
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [pr, setPr] = useState<PurchaseRequest | null>();
  const [task, setTask] = useState<{ task_id: string; via_delegation: boolean } | null>(null);
  const [acting, setActing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        request<{ proc_purchase_request_by_pk: PurchaseRequest | null }>(PR_DETAIL, { id }),
        request<{ wf_v_inbox: { task_id: string; via_delegation: boolean }[] }>(MY_TASK_FOR, { id }),
      ]);
      setPr(d.proc_purchase_request_by_pk);
      setTask(t.wf_v_inbox[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (pr === undefined) return <Spin />;
  if (pr === null) return <Alert type="warning" showIcon message="Không tìm thấy đề nghị hoặc bạn không có quyền xem." />;

  const mine = pr.requester_id === tenant.person_id;
  const editable = mine && ["DRAFT", "RETURNED"].includes(pr.status);
  const cancellable = mine && ["DRAFT", "PENDING", "RETURNED"].includes(pr.status);
  const round = pr.approval_steps.filter((s) => s.round === pr.approval_round);
  const returnedNote = pr.status === "RETURNED"
    ? pr.approval_steps.find((s) => s.round === pr.approval_round && s.status === "RETURNED")?.note : null;

  const submit = async () => {
    try {
      await request(SUBMIT_PR, { id: pr.id });
      message.success("Đã gửi duyệt");
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // Link có chữ ký trả PDF dạng tệp tải về (Content-Disposition: attachment) nên trang hiện tại không rời đi.
  const print = async () => {
    setPrinting(true);
    try {
      const { get_purchase_request_pdf: pdf } = await request<{ get_purchase_request_pdf: { url: string; file_name: string; check_code: string } }>(
        PR_PDF, { id: pr.id });
      window.location.assign(pdf.url);
      message.success(`Đã tải phiếu ${pdf.file_name} (mã kiểm tra ${pdf.check_code})`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  const cancel = () => {
    let reason = "";
    Modal.confirm({
      title: `Hủy đề nghị ${pr.doc_no}?`,
      content: <Input.TextArea rows={3} placeholder="Lý do hủy (bắt buộc)" onChange={(e) => { reason = e.target.value; }} />,
      okText: "Hủy đề nghị", okButtonProps: { danger: true }, cancelText: "Không",
      onOk: async () => {
        if (!reason.trim()) {
          message.error("Phải ghi lý do hủy");
          throw new Error("missing reason");
        }
        await request(CANCEL_PR, { id: pr.id, reason: reason.trim() }).then(load).catch((e) => message.error(e.message));
      },
    });
  };

  return (
    <Show
      title={<Space>{pr.doc_no}<StatusTag status={pr.status} /></Space>}
      headerButtons={() => (
        <Space wrap>
          {task && <Button type="primary" icon={<AuditOutlined />} onClick={() => setActing(true)}>Xử lý duyệt</Button>}
          {editable && <Button icon={<EditOutlined />} onClick={() => go({ to: { resource: "proc_purchase_request", action: "edit", id: pr.id } })}>Sửa</Button>}
          {editable && <Button type="primary" icon={<SendOutlined />} onClick={submit}>Gửi duyệt</Button>}
          {cancellable && <Button danger icon={<StopOutlined />} onClick={cancel}>Hủy</Button>}
          <Button icon={<ApartmentOutlined />} onClick={() => go({ to: `/p/process/${pr.id}` })}>Sơ đồ quy trình</Button>
          <Button icon={<PrinterOutlined />} loading={printing} onClick={print}>In phiếu</Button>
        </Space>
      )}
    >
      {returnedNote && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Bị trả về" description={returnedNote} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }} title={pr.title}>
            <Descriptions.Item label="Người lập">{pr.requester?.full_name}</Descriptions.Item>
            <Descriptions.Item label="Tư cách lập">{pr.requester_position?.name} – {pr.org_unit?.name}</Descriptions.Item>
            <Descriptions.Item label="Tổng tiền"><Typography.Text strong>{formatMoney(pr.total_amount)}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="Nhà cung cấp">{pr.partner ? `${pr.partner.code} – ${pr.partner.name}` : "—"}</Descriptions.Item>
            <Descriptions.Item label="Ngày cần hàng">{formatDay(pr.needed_by)}</Descriptions.Item>
            <Descriptions.Item label="Nhóm hàng">{pr.category_code ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Ngày lập">{formatDate(pr.created_at)}</Descriptions.Item>
            <Descriptions.Item label="Cập nhật">{formatDate(pr.updated_at)}</Descriptions.Item>
            {pr.description && <Descriptions.Item label="Mô tả" span={2}>{pr.description}</Descriptions.Item>}
          </Descriptions>
          <Table style={{ marginTop: 16 }} size="small" rowKey="id" pagination={false} dataSource={pr.purchase_request_items}
            scroll={{ x: 640 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right"><b>Tổng cộng</b></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><b>{formatMoney(pr.total_amount)}</b></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
            columns={[
              { title: "#", dataIndex: "line_no", width: 40 },
              { title: "Mô tả", render: (_, i) => <>{i.item && <Tag>{i.item.code}</Tag>}{i.description}</> },
              { title: "ĐVT", dataIndex: "uom", width: 80 },
              { title: "Số lượng", dataIndex: "quantity", align: "right", width: 100, render: (v) => Number(v).toLocaleString("vi-VN") },
              { title: "Đơn giá", dataIndex: "unit_price", align: "right", render: formatMoney },
              { title: "Thành tiền", dataIndex: "amount", align: "right", render: formatMoney },
            ]} />
          <Card style={{ marginTop: 16 }} size="small">
            <Tabs items={[
              { key: "files", label: `Tệp đính kèm (${pr.attachments.length})`,
                children: <Attachments pr={pr} me={tenant.person_id} canUpload onChange={load} /> },
              { key: "comments", label: `Trao đổi (${pr.comments.filter((c) => !c.deleted_at).length})`,
                children: <Comments pr={pr} me={tenant.person_id} onChange={load} /> },
            ]} />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card size="small" title={pr.approval_round ? `Chuỗi duyệt (lần gửi ${pr.approval_round})` : "Chuỗi duyệt"}>
            {round.length === 0 ? <Typography.Text type="secondary">Chưa gửi duyệt. Chuỗi duyệt được chốt theo hạn mức lúc gửi.</Typography.Text> : (
              <Steps direction="vertical" size="small" items={round.map((s) => {
                const open = s.tasks[0];
                return {
                  status: stepState(s.status),
                  title: `${s.position?.name ?? ""} – ${s.position?.org_unit.name ?? ""}`,
                  description: (
                    <Space direction="vertical" size={0}>
                      <span>{STEP_STATUS[s.status] ?? s.status}{s.acted_by_person ? `: ${s.acted_by_person.full_name}` : ""}
                        {s.on_behalf_of_person ? ` (duyệt thay ${s.on_behalf_of_person.full_name})` : ""}</span>
                      {open?.escalated && <Tag color="orange">Đẩy lên cấp trên: {ESCALATION_REASON[open.escalation_reason ?? ""]}</Tag>}
                      {open && !open.assignee_id && <Tag color="red">Chờ có người giữ vị trí</Tag>}
                      {s.note && <Typography.Text type="secondary" italic>“{s.note}”</Typography.Text>}
                      {s.acted_at && <Typography.Text type="secondary">{formatDate(s.acted_at)}</Typography.Text>}
                    </Space>
                  ),
                };
              })} />
            )}
          </Card>
          <Card size="small" title="Lịch sử" style={{ marginTop: 16 }}>
            <Timeline items={pr.approval_history.map((h) => ({
              children: (
                <>
                  <b>{HISTORY_EVENT[h.event] ?? h.event}</b>{h.person ? ` – ${h.person.full_name}` : ""}
                  {h.on_behalf_of_person ? ` (thay ${h.on_behalf_of_person.full_name})` : ""}
                  {typeof h.detail?.note === "string" && <div><i>“{h.detail.note}”</i></div>}
                  {typeof h.detail?.reason === "string" && <div><i>{ESCALATION_REASON[h.detail.reason] ?? h.detail.reason}</i></div>}
                  <div><Typography.Text type="secondary">{formatDate(h.created_at)}</Typography.Text></div>
                </>
              ),
            }))} />
          </Card>
        </Col>
      </Row>
      <ActModal taskId={acting ? task?.task_id ?? null : null} viaDelegation={task?.via_delegation} title={`Xử lý ${pr.doc_no}`}
                onClose={() => setActing(false)} onDone={() => { setActing(false); void load(); }} />
    </Show>
  );
};
