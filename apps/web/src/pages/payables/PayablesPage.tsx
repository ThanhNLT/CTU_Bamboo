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

import { App, Button, DatePicker, Input, InputNumber, Modal, Popconfirm, Select, Table, Tabs, Tag } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CellText, CellTitle, ListCard, ListPage, ListPageHeader } from "../../components/ui";
import { tr, trf } from "../../i18n";
import { formatDay, formatMoney } from "../../utils/format";
import {
  fetchInvoices,
  fetchNetting,
  fetchRequests,
  postGoodsReceipt,
  recordInvoice,
  recordPayment,
  runNetting,
  voidInvoice,
  type Invoice,
  type Netting,
  type NettingOverview,
  type PayableRequest,
} from "./api";

const MATCH_LABEL: Record<Invoice["match_status"], string> = {
  MATCHED: tr("Khớp hàng đã nhận"),
  OVER_RECEIPT: tr("Vượt hàng đã nhận"),
  NO_RECEIPT: tr("Chưa nhận hàng"),
};
const STATUS_LABEL: Record<Invoice["status"], string> = {
  OPEN: tr("Chưa trả"),
  PARTIAL: tr("Trả một phần"),
  PAID: tr("Đã trả đủ"),
  VOID: tr("Đã hủy"),
};
const METHOD_LABEL: Record<string, string> = {
  TRANSFER: tr("Chuyển khoản"),
  CASH: tr("Tiền mặt"),
  NETTING: tr("Đối trừ nội bộ"),
};

const money = (v: number | string) => <span className="whitespace-nowrap tabular-nums text-ink">{formatMoney(v)}</span>;

const ReceiveModal = ({ request, onClose }: { request: PayableRequest; onClose: (saved: boolean) => void }) => {
  const { message } = App.useApp();
  const open = request.lines.filter((l) => Number(l.quantity) - l.received > 0);
  const [qty, setQty] = useState<Record<string, number | null>>(
    Object.fromEntries(open.map((l) => [l.id, Number(l.quantity) - l.received])),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const lines = open
      .filter((l) => (qty[l.id] ?? 0) > 0)
      .map((l) => ({ request_item_id: l.id, quantity: qty[l.id] as number }));
    if (!lines.length) {
      message.warning(tr("Nhập số lượng nhận cho ít nhất một dòng"));
      return;
    }
    setSaving(true);
    try {
      const doc = await postGoodsReceipt(request.id, lines, note);
      message.success(trf("Đã ghi phiếu nhận hàng {0}", [doc.doc_no]));
      onClose(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={trf("Nhận hàng cho {0}", [request.doc_no])}
      okText={tr("Ghi phiếu nhận")}
      cancelText={tr("Hủy")}
      onOk={() => void save()}
      onCancel={() => onClose(false)}
      confirmLoading={saving}
      width={720}
    >
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={open}
        columns={[
          { title: "#", dataIndex: "line_no", width: 40 },
          { title: tr("Hàng hóa"), dataIndex: "description" },
          {
            title: tr("Còn lại"),
            align: "right",
            render: (_, l) => `${Number(l.quantity) - l.received} ${l.uom}`,
          },
          {
            title: tr("Nhận lần này"),
            width: 140,
            render: (_, l) => (
              <InputNumber
                aria-label={trf("Số lượng nhận dòng {0}", [l.line_no])}
                min={0}
                max={Number(l.quantity) - l.received}
                value={qty[l.id]}
                onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))}
                className="w-full"
              />
            ),
          },
        ]}
      />
      <Input.TextArea
        className="mt-3"
        aria-label={tr("Ghi chú nhận hàng")}
        placeholder={tr("Ghi chú (đợt giao, biên bản kiểm hàng...)")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
    </Modal>
  );
};

const InvoiceModal = ({ request, onClose }: { request: PayableRequest; onClose: (saved: boolean) => void }) => {
  const { message } = App.useApp();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [due, setDue] = useState<Dayjs | null>(dayjs().add(30, "day"));
  const [amount, setAmount] = useState<number | null>(
    Math.max(request.received_amount - request.invoiced_amount, 0) || null,
  );
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!number.trim() || !date || !amount) {
      message.warning(tr("Nhập số hóa đơn, ngày hóa đơn và số tiền"));
      return;
    }
    setSaving(true);
    try {
      const doc = await recordInvoice({
        requestId: request.id,
        number: number.trim(),
        invoiceDate: date.format("YYYY-MM-DD"),
        dueDate: due ? due.format("YYYY-MM-DD") : null,
        amount,
      });
      message.success(trf("Đã ghi hóa đơn {0}", [doc.doc_no]));
      onClose(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={trf("Hóa đơn nhà cung cấp cho {0}", [request.doc_no])}
      okText={tr("Ghi hóa đơn")}
      cancelText={tr("Hủy")}
      onOk={() => void save()}
      onCancel={() => onClose(false)}
      confirmLoading={saving}
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[12.5px] text-muted">
          {trf("Đã nhận {0}, đã ghi hóa đơn {1}. Hóa đơn vượt giá trị đã nhận sẽ chờ nhận đủ hàng mới trả được.", [
            formatMoney(request.received_amount),
            formatMoney(request.invoiced_amount),
          ])}
        </p>
        <Input
          aria-label={tr("Số hóa đơn của nhà cung cấp")}
          placeholder={tr("Số hóa đơn của nhà cung cấp")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <DatePicker aria-label={tr("Ngày hóa đơn")} value={date} onChange={setDate} format="DD-MM-YYYY" />
          <DatePicker
            aria-label={tr("Hạn thanh toán")}
            placeholder={tr("Hạn thanh toán")}
            value={due}
            onChange={setDue}
            format="DD-MM-YYYY"
          />
        </div>
        <InputNumber
          aria-label={tr("Số tiền hóa đơn")}
          className="w-full"
          min={0}
          value={amount}
          onChange={setAmount}
          formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
          parser={(v) => Number((v ?? "").replace(/\./g, ""))}
          addonAfter={tr("đồng")}
        />
      </div>
    </Modal>
  );
};

const PayModal = ({ invoice, onClose }: { invoice: Invoice; onClose: (saved: boolean) => void }) => {
  const { message } = App.useApp();
  const [amount, setAmount] = useState<number | null>(Number(invoice.amount) - Number(invoice.paid_amount));
  const [method, setMethod] = useState("TRANSFER");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!amount) return;
    setSaving(true);
    try {
      const doc = await recordPayment(invoice.id, amount, method, reference);
      message.success(trf("Đã ghi thanh toán {0}", [doc.doc_no]));
      onClose(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={trf("Thanh toán hóa đơn {0}", [invoice.doc_no])}
      okText={tr("Ghi thanh toán")}
      cancelText={tr("Hủy")}
      onOk={() => void save()}
      onCancel={() => onClose(false)}
      confirmLoading={saving}
    >
      <div className="flex flex-col gap-3">
        <InputNumber
          aria-label={tr("Số tiền thanh toán")}
          className="w-full"
          min={0}
          max={Number(invoice.amount) - Number(invoice.paid_amount)}
          value={amount}
          onChange={setAmount}
          formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
          parser={(v) => Number((v ?? "").replace(/\./g, ""))}
          addonAfter={tr("đồng")}
        />
        <Select
          aria-label={tr("Hình thức thanh toán")}
          value={method}
          onChange={setMethod}
          options={["TRANSFER", "CASH"].map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
        />
        <Input
          aria-label={tr("Số chứng từ thanh toán")}
          placeholder={tr("Số ủy nhiệm chi, phiếu chi...")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
    </Modal>
  );
};

const RequestsTab = ({ rows, reload }: { rows: PayableRequest[]; reload: () => void }) => {
  const [receiving, setReceiving] = useState<PayableRequest>();
  const [invoicing, setInvoicing] = useState<PayableRequest>();
  const close = (setter: (v: undefined) => void) => (saved: boolean) => {
    setter(undefined);
    if (saved) reload();
  };
  return (
    <ListCard title={tr("Đề nghị đã duyệt")} meta={trf("{0} đề nghị", [rows.length])}>
      <Table<PayableRequest> rowKey="id" dataSource={rows} className="list-table" scroll={{ x: 860 }}>
        <Table.Column<PayableRequest>
          title={tr("Đề nghị")}
          render={(_, r) => <CellTitle title={r.title} sub={r.doc_no} />}
        />
        <Table.Column<PayableRequest>
          title={tr("Nhà cung cấp")}
          responsive={["lg"]}
          render={(_, r) => (
            <CellText
              main={r.partner?.name ?? "—"}
              sub={r.partner?.internal_unit_id ? tr("Nội bộ tập đoàn") : r.org_unit?.name}
            />
          )}
        />
        <Table.Column<PayableRequest> title={tr("Giá trị")} align="right" render={(_, r) => money(r.total_amount)} />
        <Table.Column<PayableRequest> title={tr("Đã nhận")} align="right" render={(_, r) => money(r.received_amount)} />
        <Table.Column<PayableRequest>
          title={tr("Đã ghi hóa đơn")}
          align="right"
          responsive={["md"]}
          render={(_, r) => money(r.invoiced_amount)}
        />
        <Table.Column<PayableRequest>
          title={<span className="sr-only">{tr("Thao tác")}</span>}
          align="right"
          render={(_, r) => {
            const pending = r.lines.some((l) => Number(l.quantity) - l.received > 0);
            return (
              <div className="flex justify-end gap-2">
                <Button size="small" disabled={!pending} onClick={() => setReceiving(r)}>
                  {tr("Nhận hàng")}
                </Button>
                <Button size="small" disabled={!r.partner} onClick={() => setInvoicing(r)}>
                  {tr("Ghi hóa đơn")}
                </Button>
              </div>
            );
          }}
        />
      </Table>
      {receiving && <ReceiveModal request={receiving} onClose={close(setReceiving)} />}
      {invoicing && <InvoiceModal request={invoicing} onClose={close(setInvoicing)} />}
    </ListCard>
  );
};

const InvoicesTab = ({ rows, reload }: { rows: Invoice[]; reload: () => void }) => {
  const { message } = App.useApp();
  const [paying, setPaying] = useState<Invoice>();
  const [filter, setFilter] = useState("UNPAID");
  const shown = rows.filter((i) =>
    filter === "ALL" ? true : filter === "UNPAID" ? i.status === "OPEN" || i.status === "PARTIAL" : i.status === filter,
  );
  const cancel = async (inv: Invoice) => {
    try {
      await voidInvoice(inv.id);
      message.success(trf("Đã hủy hóa đơn {0}", [inv.doc_no]));
      reload();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  return (
    <ListCard
      title={tr("Hóa đơn nhà cung cấp")}
      meta={trf("{0} hóa đơn", [shown.length])}
      toolbar={
        <Select
          aria-label={tr("Lọc hóa đơn")}
          value={filter}
          onChange={setFilter}
          className="w-48"
          options={[
            { value: "UNPAID", label: tr("Còn nợ") },
            { value: "PAID", label: STATUS_LABEL.PAID },
            { value: "VOID", label: STATUS_LABEL.VOID },
            { value: "ALL", label: tr("Tất cả") },
          ]}
        />
      }
    >
      <Table<Invoice>
        rowKey="id"
        dataSource={shown}
        className="list-table"
        scroll={{ x: 920 }}
        expandable={{
          rowExpandable: (i) => i.payments.length > 0,
          expandedRowRender: (i) => (
            <ul className="m-0 list-none p-0 text-[12.5px]">
              {i.payments.map((p) => (
                <li key={p.id}>
                  {p.doc_no} · {formatDay(p.paid_at)} · {METHOD_LABEL[p.method] ?? p.method} · {formatMoney(p.amount)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </li>
              ))}
            </ul>
          ),
        }}
      >
        <Table.Column<Invoice>
          title={tr("Hóa đơn")}
          render={(_, i) => <CellTitle title={`${i.partner?.name ?? "—"} · ${i.supplier_invoice_no}`} sub={i.doc_no} />}
        />
        <Table.Column<Invoice>
          title={tr("Đề nghị")}
          responsive={["lg"]}
          render={(_, i) => <CellText main={i.request?.doc_no ?? "—"} sub={i.company?.name} />}
        />
        <Table.Column<Invoice>
          title={tr("Hạn trả")}
          responsive={["md"]}
          render={(_, i) => formatDay(i.due_date ?? i.invoice_date)}
        />
        <Table.Column<Invoice> title={tr("Số tiền")} align="right" render={(_, i) => money(i.amount)} />
        <Table.Column<Invoice>
          title={tr("Còn nợ")}
          align="right"
          render={(_, i) => money(Number(i.amount) - Number(i.paid_amount))}
        />
        <Table.Column<Invoice>
          title={tr("Trạng thái")}
          render={(_, i) => (
            <div className="flex flex-wrap gap-1">
              <Tag>{STATUS_LABEL[i.status]}</Tag>
              {i.status !== "VOID" && i.status !== "PAID" && (
                <Tag color={i.match_status === "MATCHED" ? "green" : "orange"}>{MATCH_LABEL[i.match_status]}</Tag>
              )}
            </div>
          )}
        />
        <Table.Column<Invoice>
          title={<span className="sr-only">{tr("Thao tác")}</span>}
          align="right"
          render={(_, i) =>
            i.status === "OPEN" || i.status === "PARTIAL" ? (
              <div className="flex justify-end gap-2">
                <Button size="small" disabled={i.match_status !== "MATCHED"} onClick={() => setPaying(i)}>
                  {tr("Thanh toán")}
                </Button>
                {Number(i.paid_amount) === 0 && (
                  <Popconfirm
                    title={trf("Hủy hóa đơn {0}?", [i.doc_no])}
                    okText={tr("Hủy hóa đơn")}
                    cancelText={tr("Không")}
                    onConfirm={() => void cancel(i)}
                  >
                    <Button size="small" danger type="text">
                      {tr("Hủy")}
                    </Button>
                  </Popconfirm>
                )}
              </div>
            ) : null
          }
        />
      </Table>
      {paying && (
        <PayModal
          invoice={paying}
          onClose={(saved) => {
            setPaying(undefined);
            if (saved) reload();
          }}
        />
      )}
    </ListCard>
  );
};

const NettingTab = ({
  overview,
  history,
  reload,
}: {
  overview: NettingOverview;
  history: Netting[];
  reload: () => void;
}) => {
  const { message } = App.useApp();
  const name = useMemo(() => Object.fromEntries(overview.companies.map((c) => [c.id, c.name])), [overview]);
  const [busy, setBusy] = useState<string>();
  const run = async (a: string, b: string) => {
    setBusy(`${a}:${b}`);
    try {
      const doc = await runNetting(a, b);
      message.success(trf("Đã đối trừ công nợ {0}", [doc.doc_no]));
      reload();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <ListCard
        title={tr("Công nợ nội bộ hai chiều")}
        meta={tr("Phần nợ chéo nhỏ hơn được trừ vào các hóa đơn cũ nhất của cả hai bên")}
      >
        <Table
          rowKey={(p) => `${p.company_a}:${p.company_b}`}
          dataSource={overview.positions}
          pagination={false}
          className="list-table"
          locale={{ emptyText: tr("Chưa có công nợ nội bộ còn mở") }}
          columns={[
            {
              title: tr("Hai công ty"),
              render: (_, p) => `${name[p.company_a] ?? "—"} ↔ ${name[p.company_b] ?? "—"}`,
            },
            { title: tr("Bên thứ nhất nợ"), align: "right", render: (_, p) => money(p.a_owes_b) },
            { title: tr("Bên thứ hai nợ"), align: "right", render: (_, p) => money(p.b_owes_a) },
            { title: tr("Đối trừ được"), align: "right", render: (_, p) => money(p.nettable) },
            {
              title: <span className="sr-only">{tr("Thao tác")}</span>,
              align: "right",
              render: (_, p) => (
                <Popconfirm
                  title={trf("Đối trừ {0} giữa hai công ty?", [formatMoney(p.nettable)])}
                  okText={tr("Đối trừ")}
                  cancelText={tr("Không")}
                  disabled={!p.can_run}
                  onConfirm={() => void run(p.company_a, p.company_b)}
                >
                  <Button
                    size="small"
                    type="primary"
                    disabled={!p.can_run}
                    loading={busy === `${p.company_a}:${p.company_b}`}
                  >
                    {tr("Đối trừ")}
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </ListCard>
      <ListCard title={tr("Lịch sử đối trừ")} meta={trf("{0} lần", [history.length])}>
        <Table<Netting> rowKey="id" dataSource={history} className="list-table">
          <Table.Column<Netting> title={tr("Số phiếu")} dataIndex="doc_no" />
          <Table.Column<Netting>
            title={tr("Hai công ty")}
            render={(_, n) => `${n.company_a_org_unit?.name ?? "—"} ↔ ${n.company_b_org_unit?.name ?? "—"}`}
          />
          <Table.Column<Netting> title={tr("Số tiền")} align="right" render={(_, n) => money(n.amount)} />
          <Table.Column<Netting> title={tr("Ngày")} render={(_, n) => formatDay(n.created_at)} />
        </Table>
      </ListCard>
    </div>
  );
};

export const PayablesPage = () => {
  const { message } = App.useApp();
  const [requests, setRequests] = useState<PayableRequest[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [netting, setNetting] = useState<{ overview: NettingOverview; history: Netting[] }>({
    overview: { companies: [], positions: [] },
    history: [],
  });
  const load = useCallback(() => {
    Promise.all([fetchRequests(), fetchInvoices(), fetchNetting()])
      .then(([r, i, n]) => {
        setRequests(r);
        setInvoices(i);
        setNetting(n);
      })
      .catch((e: Error) => message.error(trf("Không tải được công nợ: {0}", [e.message])));
  }, [message]);
  useEffect(load, [load]);
  const unpaid = invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIAL");
  return (
    <ListPage>
      <ListPageHeader
        title={tr("Nhận hàng & công nợ")}
        description={trf("Còn nợ nhà cung cấp {0} trên {1} hóa đơn", [
          formatMoney(unpaid.reduce((s, i) => s + Number(i.amount) - Number(i.paid_amount), 0)),
          unpaid.length,
        ])}
      />
      <Tabs
        items={[
          {
            key: "receive",
            label: tr("Nhận hàng & hóa đơn"),
            children: <RequestsTab rows={requests} reload={load} />,
          },
          {
            key: "invoices",
            label: tr("Hóa đơn & thanh toán"),
            children: <InvoicesTab rows={invoices} reload={load} />,
          },
          {
            key: "netting",
            label: tr("Đối trừ nội bộ"),
            children: <NettingTab overview={netting.overview} history={netting.history} reload={load} />,
          },
        ]}
      />
    </ListPage>
  );
};
