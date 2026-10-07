// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { Show } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
import {
  Alert, App, Button, Card, Col, Descriptions, Input, Row, Select, Space, Spin, Table, Tag, Typography,
} from "antd";
import { CheckOutlined, CloseOutlined, StopOutlined } from "@ant-design/icons";
import { request } from "../../api/client";
import { useSession } from "../../auth/session";
import { StatusTag } from "../../components/StatusTag";
import { Comments } from "../../components/document/Comments";
import type { Comment } from "../../components/document/types";
import { formatDate, formatDay, formatMoney } from "../../utils/format";
import { IC_STATUS_LABEL } from "../../utils/status";
import { CANCEL_IC, CONFIRM_IC, IC_DETAIL, REJECT_IC, SELLER_LOTS } from "./queries";

type Line = {
  id: string; line_no: number; item_id: string | null; description: string; uom: string; quantity: number;
  unit_price: number; amount: number; item: { code: string } | null; lot: { lot_no: string; produced_on: string } | null;
};
type IcOrder = {
  id: string; doc_no: string; status: string; total_amount: number; created_at: string; decided_at: string | null;
  decision_note: string | null; created_by: string; can_confirm: boolean;
  seller_unit: { name: string; path: string }; buyer_unit: { name: string };
  created_by_person: { full_name: string } | null; decided_by_person: { full_name: string } | null;
  purchase_requests: { id: string; doc_no: string; title: string }[];
  purchase_orders: { id: string; doc_no: string; status: string }[];
  ic_order_items: Line[];
  comments: Comment[];
};
type Lot = {
  id: string; lot_no: string; item_id: string; quantity: number; uom: string; produced_on: string;
  org_unit: { name: string } | null;
};

// Hỏi lý do (bắt buộc) rồi gọi Action; lỗi giữ hộp thoại mở.
const askReason = (modal: ReturnType<typeof App.useApp>["modal"], title: string, okText: string,
                   run: (reason: string) => Promise<unknown>, onError: (e: Error) => void) => {
  let reason = "";
  modal.confirm({
    title,
    content: <Input.TextArea rows={3} placeholder="Lý do (bắt buộc)" onChange={(e) => { reason = e.target.value; }} />,
    okText, okButtonProps: { danger: true }, cancelText: "Không",
    onOk: async () => {
      if (!reason.trim()) {
        onError(new Error("Phải ghi lý do"));
        throw new Error("missing reason");
      }
      await run(reason.trim()).catch((e: Error) => { onError(e); throw e; });
    },
  });
};

export const IcOrderShow = () => {
  const { id } = useParsed();
  const go = useGo();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [order, setOrder] = useState<IcOrder | null>();
  const [lots, setLots] = useState<Lot[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const d = await request<{ ic_ic_order_by_pk: IcOrder | null }>(IC_DETAIL, { id });
      const o = d.ic_ic_order_by_pk;
      setOrder(o);
      if (o?.can_confirm) {
        const items = o.ic_order_items.map((l) => l.item_id).filter((x): x is string => !!x);
        const r = await request<{ mfg_lot: Lot[] }>(SELLER_LOTS, { items, seller: o.seller_unit.path });
        setLots(r.mfg_lot);
        // Mặt hàng chỉ có một lô thì chọn sẵn.
        setChosen(Object.fromEntries(o.ic_order_items.flatMap((l) => {
          const options = r.mfg_lot.filter((x) => x.item_id === l.item_id);
          return options.length === 1 ? [[l.id, options[0].id]] : [];
        })));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (order === undefined) return <Spin />;
  if (order === null) return <Alert type="warning" showIcon message="Không tìm thấy đơn hàng nội bộ hoặc bạn không có quyền xem." />;

  const lotsFor = (line: Line) => lots.filter((x) => x.item_id === line.item_id);
  const missing = order.can_confirm && order.ic_order_items.some((l) => lotsFor(l).length > 0 && !chosen[l.id]);
  const cancellable = order.status === "PENDING" && order.created_by === tenant.person_id;
  const pr = order.purchase_requests[0];
  const po = order.purchase_orders[0];

  const confirm = async () => {
    setBusy(true);
    try {
      await request(CONFIRM_IC, {
        id: order.id, lots: Object.entries(chosen).map(([line_id, lot_id]) => ({ line_id, lot_id })),
      });
      message.success(`Đã xác nhận ${order.doc_no}`);
      await load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fail = (e: Error) => message.error(e.message);
  const reject = () => askReason(modal, `Từ chối đơn ${order.doc_no}?`, "Từ chối",
    (reason) => request(REJECT_IC, { id: order.id, reason }).then(load), fail);
  const cancel = () => askReason(modal, `Hủy đơn ${order.doc_no}?`, "Hủy đơn",
    (reason) => request(CANCEL_IC, { id: order.id, reason }).then(load), fail);

  return (
    <Show
      title={<Space>{order.doc_no}<StatusTag status={order.status} labels={IC_STATUS_LABEL} /></Space>}
      headerButtons={() => (
        <Space wrap>
          {order.can_confirm && (
            <Button type="primary" icon={<CheckOutlined />} loading={busy} disabled={missing} onClick={confirm}>
              Xác nhận và xuất lô
            </Button>
          )}
          {order.can_confirm && <Button danger icon={<CloseOutlined />} onClick={reject}>Từ chối</Button>}
          {cancellable && <Button danger icon={<StopOutlined />} onClick={cancel}>Hủy đơn</Button>}
        </Space>
      )}
    >
      {order.status === "REJECTED" && order.decision_note && (
        <Alert style={{ marginBottom: 16 }} type="error" showIcon message="Bên bán từ chối" description={order.decision_note} />
      )}
      {order.status === "CANCELLED" && order.decision_note && (
        <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Bên mua đã hủy" description={order.decision_note} />
      )}
      {order.can_confirm && (
        <Alert style={{ marginBottom: 16 }} type="info" showIcon message="Chọn lô xuất cho từng dòng hàng rồi xác nhận."
               description="Xác nhận xong, hệ thống tự sinh đơn mua cho bên mua; lô xuất được ghi để truy xuất về sau." />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}>
            <Descriptions.Item label="Bên mua">{order.buyer_unit.name}</Descriptions.Item>
            <Descriptions.Item label="Bên bán">{order.seller_unit.name}</Descriptions.Item>
            <Descriptions.Item label="Người đặt">{order.created_by_person?.full_name}</Descriptions.Item>
            <Descriptions.Item label="Ngày đặt">{formatDate(order.created_at)}</Descriptions.Item>
            <Descriptions.Item label="Tổng tiền"><Typography.Text strong>{formatMoney(order.total_amount)}</Typography.Text></Descriptions.Item>
            {/* Bên bán không xem đề nghị của bên mua: ẩn dòng thay vì hiện trống. */}
            {pr && (
              <Descriptions.Item label="Đề nghị nguồn">
                <Typography.Link onClick={() => go({ to: { resource: "proc_purchase_request", action: "show", id: pr.id } })}>
                  {pr.doc_no} – {pr.title}</Typography.Link>
              </Descriptions.Item>
            )}
            {order.decided_by_person && (
              <Descriptions.Item label={order.status === "CANCELLED" ? "Người hủy" : "Bên bán xử lý"}>
                {order.decided_by_person.full_name} – {formatDate(order.decided_at)}
              </Descriptions.Item>
            )}
            {po && <Descriptions.Item label="Đơn mua"><Tag color="blue">{po.doc_no}</Tag></Descriptions.Item>}
          </Descriptions>
          <Table style={{ marginTop: 16 }} size="small" rowKey="id" pagination={false} dataSource={order.ic_order_items}
            scroll={{ x: 760 }}
            columns={[
              { title: "#", dataIndex: "line_no", width: 40 },
              { title: "Mô tả", render: (_, l) => <>{l.item && <Tag>{l.item.code}</Tag>}{l.description}</> },
              { title: "ĐVT", dataIndex: "uom", width: 70 },
              { title: "Số lượng", dataIndex: "quantity", align: "right", width: 100, render: (v) => Number(v).toLocaleString("vi-VN") },
              { title: "Thành tiền", dataIndex: "amount", align: "right", render: formatMoney },
              {
                title: "Lô xuất", width: 260,
                render: (_, l) => {
                  if (!order.can_confirm) return l.lot ? <Tag color="purple">{l.lot.lot_no}</Tag> : "—";
                  const options = lotsFor(l);
                  if (options.length === 0) return <Typography.Text type="secondary">Không quản lý lô</Typography.Text>;
                  return (
                    <Select style={{ width: "100%" }} placeholder="Chọn lô" value={chosen[l.id]} aria-label={`Lô dòng ${l.line_no}`}
                      onChange={(v) => setChosen((c) => ({ ...c, [l.id]: v }))}
                      options={options.map((x) => ({
                        value: x.id,
                        label: `${x.lot_no} · ${Number(x.quantity).toLocaleString("vi-VN")} ${x.uom} · ${formatDay(x.produced_on)}`,
                      }))} />
                  );
                },
              },
            ]} />
          <Card style={{ marginTop: 16 }} size="small" title={`Trao đổi (${order.comments.filter((c) => !c.deleted_at).length})`}>
            <Comments doc={order} entityType="ic.ic_order" me={tenant.person_id} onChange={load} />
          </Card>
        </Col>
      </Row>
    </Show>
  );
};
