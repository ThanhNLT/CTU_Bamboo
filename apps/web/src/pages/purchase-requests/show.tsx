/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useCallback, useEffect, useState } from "react";
import { Show } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
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
} from "antd";
import {
  ApartmentOutlined,
  AuditOutlined,
  EditOutlined,
  PrinterOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons";

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
import { tr, trf } from "../../i18n";

export const PurchaseRequestShow = () => {
  const { id } = useParsed();
  const go = useGo();
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
    return <Alert type="warning" showIcon message={tr("Không tìm thấy đề nghị hoặc bạn không có quyền xem.")} />;

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
      message.success(tr("Đã gửi duyệt"));
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const print = async () => {
    setPrinting(true);
    try {
      const { get_purchase_request_pdf: pdf } = await request<{
        get_purchase_request_pdf: { url: string; file_name: string; check_code: string };
      }>(PR_PDF, { id: pr.id });
      window.location.assign(pdf.url);
      message.success(trf("Đã tải phiếu {0} (mã kiểm tra {1})", [pdf.file_name, pdf.check_code]));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  const cancel = () => {
    let reason = "";
    modal.confirm({
      title: trf("Hủy đề nghị {0}?", [pr.doc_no]),
      content: (
        <Input.TextArea
          rows={3}
          placeholder={tr("Lý do hủy (bắt buộc)")}
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: tr("Hủy đề nghị"),
      okButtonProps: { danger: true },
      cancelText: tr("Không"),
      onOk: async () => {
        if (!reason.trim()) {
          message.error(tr("Phải ghi lý do hủy"));
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
              {tr("Xử lý duyệt")}
            </Button>
          )}
          {editable && (
            <Button
              icon={<EditOutlined />}
              onClick={() => go({ to: { resource: "proc_purchase_request", action: "edit", id: pr.id } })}
            >
              {tr("Sửa")}
            </Button>
          )}
          {editable && (
            <Button type="primary" icon={<SendOutlined />} onClick={submit}>
              {tr("Gửi duyệt")}
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              {tr("Hủy")}
            </Button>
          )}
          <Button icon={<ApartmentOutlined />} onClick={() => go({ to: `/p/process/${pr.id}` })}>
            {tr("Sơ đồ quy trình")}
          </Button>
          <Button icon={<PrinterOutlined />} loading={printing} onClick={print}>
            {tr("In phiếu")}
          </Button>
        </Space>
      )}
    >
      {returnedNote && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={tr("Bị trả về")}
          description={returnedNote}
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }} title={pr.title}>
            <Descriptions.Item label={tr("Người lập")}>{pr.requester?.full_name}</Descriptions.Item>
            <Descriptions.Item label={tr("Tư cách lập")}>
              {pr.requester_position?.name} – {pr.org_unit?.name}
            </Descriptions.Item>
            <Descriptions.Item label={tr("Tổng tiền")}>
              <Typography.Text strong>{formatMoney(pr.total_amount)}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={tr("Nhà cung cấp")}>
              {pr.partner
                ? `${pr.partner.code} – ${pr.partner.name}`
                : pr.proposed_partner_name
                  ? `${pr.proposed_partner_name}${pr.proposed_partner_tax_code ? ` · MST ${pr.proposed_partner_tax_code}` : ""}`
                  : "—"}
              {pr.proposed_partner_name && <Tag style={{ marginLeft: 8 }}>{tr("Chưa có trong danh mục")}</Tag>}
              {pr.partner?.internal_unit_id && <Tag style={{ marginLeft: 8 }}>{tr("Nội bộ")}</Tag>}
            </Descriptions.Item>
            {pr.ic_order && (
              <Descriptions.Item label={tr("Đơn hàng nội bộ")}>
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
            <Descriptions.Item label={tr("Ngày cần hàng")}>{formatDay(pr.needed_by)}</Descriptions.Item>
            <Descriptions.Item label={tr("Nhóm hàng")}>{pr.category_code ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Ngày lập")}>{formatDate(pr.created_at)}</Descriptions.Item>
            <Descriptions.Item label={tr("Cập nhật")}>{formatDate(pr.updated_at)}</Descriptions.Item>
            {pr.description && (
              <Descriptions.Item label={tr("Mô tả")} span={2}>
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
                  <b>{tr("Tổng cộng")}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b>{formatMoney(pr.total_amount)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
            columns={[
              { title: "#", dataIndex: "line_no", width: 40 },
              {
                title: tr("Mô tả"),
                render: (_, i) => (
                  <>
                    {i.item && <Tag>{i.item.code}</Tag>}
                    {i.description}
                  </>
                ),
              },
              { title: tr("ĐVT"), dataIndex: "uom", width: 80 },
              {
                title: tr("Số lượng"),
                dataIndex: "quantity",
                align: "right",
                width: 100,
                render: (v) => Number(v).toLocaleString("vi-VN"),
              },
              { title: tr("Đơn giá"), dataIndex: "unit_price", align: "right", render: formatMoney },
              { title: tr("Thành tiền"), dataIndex: "amount", align: "right", render: formatMoney },
            ]}
          />
          <Card style={{ marginTop: 16 }} size="small">
            <Tabs
              items={[
                {
                  key: "files",
                  label: trf("Tệp đính kèm ({0})", [pr.attachments.length]),
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
                  label: trf("Trao đổi ({0})", [pr.comments.filter((c) => !c.deleted_at).length]),
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
            emptyHint={tr("Chưa gửi duyệt. Chuỗi duyệt được chốt theo hạn mức lúc gửi.")}
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={trf("Xử lý {0}", [pr.doc_no])}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
    </Show>
  );
};
