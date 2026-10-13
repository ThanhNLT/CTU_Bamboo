// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { useCallback, useEffect, useState } from "react"; // React
import { Show } from "@refinedev/antd"; // Refine Ant Design
import { useGo, useParsed } from "@refinedev/core"; // Refine
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd"; // Ant Design
import {
  ApartmentOutlined,
  AuditOutlined,
  EditOutlined,
  PrinterOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons"; // Ant Design Icons

// ===== Module nội bộ =====
import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { ActModal } from "../../components/approval/ActModal";
import { formatDate, formatDay, formatMoney } from "../../utils/format";
import { IC_STATUS_LABEL } from "../../utils/status";
import { StatusTag } from "../../components/StatusTag";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { Attachments } from "../../components/document/Attachments";
import { Comments } from "../../components/document/Comments";
import { CANCEL_PR, MY_TASK_FOR, PR_DETAIL, PR_PDF, SUBMIT_PR } from "./queries";
import type { PurchaseRequest } from "./types";

// ===== Component =====
export const PurchaseRequestShow = () => {
  const { id } = useParsed();
  const go = useGo();
  // modal của App.useApp(): Modal.confirm tĩnh của antd v5 không hiển thị trên React 19.
  const { message, modal } = App.useApp();
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

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (pr === undefined) return <Spin />;
  if (pr === null)
    return <Alert type="warning" showIcon message="Không tìm thấy đề nghị hoặc bạn không có quyền xem." />;

  const mine = pr.requester_id === tenant.person_id;
  const editable = mine && ["DRAFT", "RETURNED"].includes(pr.status);
  const cancellable = mine && ["DRAFT", "PENDING", "RETURNED"].includes(pr.status);
  const returnedNote =
    pr.status === "RETURNED"
      ? pr.approval_steps.find((s) => s.round === pr.approval_round && s.status === "RETURNED")?.note
      : null;

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
      const { get_purchase_request_pdf: pdf } = await request<{
        get_purchase_request_pdf: { url: string; file_name: string; check_code: string };
      }>(PR_PDF, { id: pr.id });
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
    modal.confirm({
      title: `Hủy đề nghị ${pr.doc_no}?`,
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
        await request(CANCEL_PR, { id: pr.id, reason: reason.trim() })
          .then(load)
          .catch((e) => message.error(e.message));
      },
    });
  };

  return (
    <Show
      title={
        <Space>
          {pr.doc_no}
          <StatusTag status={pr.status} />
        </Space>
      }
      headerButtons={() => (
        <Space wrap>
          {task && (
            <Button type="primary" icon={<AuditOutlined />} onClick={() => setActing(true)}>
              Xử lý duyệt
            </Button>
          )}
          {editable && (
            <Button
              icon={<EditOutlined />}
              onClick={() => go({ to: { resource: "proc_purchase_request", action: "edit", id: pr.id } })}
            >
              Sửa
            </Button>
          )}
          {editable && (
            <Button type="primary" icon={<SendOutlined />} onClick={submit}>
              Gửi duyệt
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              Hủy
            </Button>
          )}
          <Button icon={<ApartmentOutlined />} onClick={() => go({ to: `/p/process/${pr.id}` })}>
            Sơ đồ quy trình
          </Button>
          <Button icon={<PrinterOutlined />} loading={printing} onClick={print}>
            In phiếu
          </Button>
        </Space>
      )}
    >
      {returnedNote && (
        <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Bị trả về" description={returnedNote} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }} title={pr.title}>
            <Descriptions.Item label="Người lập">{pr.requester?.full_name}</Descriptions.Item>
            <Descriptions.Item label="Tư cách lập">
              {pr.requester_position?.name} – {pr.org_unit?.name}
            </Descriptions.Item>
            <Descriptions.Item label="Tổng tiền">
              <Typography.Text strong>{formatMoney(pr.total_amount)}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Nhà cung cấp">
              {pr.partner ? `${pr.partner.code} – ${pr.partner.name}` : "—"}
              {pr.partner?.internal_unit_id && <Tag style={{ marginLeft: 8 }}>Nội bộ</Tag>}
            </Descriptions.Item>
            {pr.ic_order && (
              <Descriptions.Item label="Đơn hàng nội bộ">
                <Space>
                  <Typography.Link
                    onClick={() => go({ to: { resource: "ic_ic_order", action: "show", id: pr.ic_order!.id } })}
                  >
                    {pr.ic_order.doc_no}
                  </Typography.Link>
                  <StatusTag status={pr.ic_order.status} labels={IC_STATUS_LABEL} />
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Ngày cần hàng">{formatDay(pr.needed_by)}</Descriptions.Item>
            <Descriptions.Item label="Nhóm hàng">{pr.category_code ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Ngày lập">{formatDate(pr.created_at)}</Descriptions.Item>
            <Descriptions.Item label="Cập nhật">{formatDate(pr.updated_at)}</Descriptions.Item>
            {pr.description && (
              <Descriptions.Item label="Mô tả" span={2}>
                {pr.description}
              </Descriptions.Item>
            )}
          </Descriptions>
          <Table
            style={{ marginTop: 16 }}
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={pr.purchase_request_items}
            scroll={{ x: 640 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  <b>Tổng cộng</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b>{formatMoney(pr.total_amount)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
            columns={[
              { title: "#", dataIndex: "line_no", width: 40 },
              {
                title: "Mô tả",
                render: (_, i) => (
                  <>
                    {i.item && <Tag>{i.item.code}</Tag>}
                    {i.description}
                  </>
                ),
              },
              { title: "ĐVT", dataIndex: "uom", width: 80 },
              {
                title: "Số lượng",
                dataIndex: "quantity",
                align: "right",
                width: 100,
                render: (v) => Number(v).toLocaleString("vi-VN"),
              },
              { title: "Đơn giá", dataIndex: "unit_price", align: "right", render: formatMoney },
              { title: "Thành tiền", dataIndex: "amount", align: "right", render: formatMoney },
            ]}
          />
          <Card style={{ marginTop: 16 }} size="small">
            <Tabs
              items={[
                {
                  key: "files",
                  label: `Tệp đính kèm (${pr.attachments.length})`,
                  children: (
                    <Attachments
                      doc={pr}
                      entityType="proc.purchase_request"
                      me={tenant.person_id}
                      canUpload
                      onChange={load}
                    />
                  ),
                },
                {
                  key: "comments",
                  label: `Trao đổi (${pr.comments.filter((c) => !c.deleted_at).length})`,
                  children: (
                    <Comments doc={pr} entityType="proc.purchase_request" me={tenant.person_id} onChange={load} />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <ApprovalPanel
            round={pr.approval_round}
            steps={pr.approval_steps}
            history={pr.approval_history}
            emptyHint="Chưa gửi duyệt. Chuỗi duyệt được chốt theo hạn mức lúc gửi."
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={`Xử lý ${pr.doc_no}`}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
    </Show>
  );
};
