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

import { request } from "../../api/client";

export type ReceiptLine = {
  id: string;
  line_no: number;
  description: string;
  uom: string;
  quantity: number;
  unit_price: number;
  received: number;
};

export type PayableRequest = {
  id: string;
  doc_no: string;
  title: string;
  total_amount: number;
  partner: { name: string; internal_unit_id: string | null } | null;
  org_unit: { name: string } | null;
  lines: ReceiptLine[];
  received_amount: number;
  invoiced_amount: number;
  receipts: { id: string; doc_no: string; amount: number; received_at: string }[];
};

export type Invoice = {
  id: string;
  doc_no: string;
  supplier_invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  amount: number;
  paid_amount: number;
  match_status: "MATCHED" | "OVER_RECEIPT" | "NO_RECEIPT";
  status: "OPEN" | "PARTIAL" | "PAID" | "VOID";
  partner: { name: string } | null;
  company: { name: string } | null;
  seller_company: { name: string } | null;
  request: { doc_no: string; title: string } | null;
  payments: { id: string; doc_no: string; amount: number; method: string; paid_at: string; reference: string | null }[];
};

export type NettingPosition = {
  company_a: string;
  company_b: string;
  a_owes_b: string;
  b_owes_a: string;
  nettable: string;
  can_run: boolean;
};

export type NettingOverview = { companies: { id: string; name: string }[]; positions: NettingPosition[] };

export type Netting = {
  id: string;
  doc_no: string;
  amount: number;
  note: string | null;
  created_at: string;
  company_a_org_unit: { name: string } | null;
  company_b_org_unit: { name: string } | null;
};

const REQUESTS = `query PayableRequests {
  proc_purchase_request(where: {status: {_eq: "APPROVED"}}, order_by: {updated_at: desc}, limit: 200) {
    id doc_no title total_amount
    partner { name internal_unit_id }
    org_unit { name }
    purchase_request_items(order_by: {line_no: asc}) {
      id line_no description uom quantity unit_price
      goods_receipt_items { quantity }
    }
    goods_receipts(order_by: {received_at: desc}) { id doc_no amount received_at }
    invoices(where: {status: {_neq: "VOID"}}) { amount }
  }
}`;

const INVOICES = `query Invoices {
  fin_invoice(order_by: {invoice_date: desc}, limit: 300) {
    id doc_no supplier_invoice_no invoice_date due_date amount paid_amount match_status status
    partner { name } company { name } seller_company { name } request { doc_no title }
    payments(order_by: {paid_at: desc}) { id doc_no amount method paid_at reference }
  }
}`;

const NETTINGS = `query Nettings {
  fin_netting(order_by: {created_at: desc}, limit: 100) {
    id doc_no amount note created_at company_a_org_unit { name } company_b_org_unit { name }
  }
  netting_overview { data }
}`;

type RawRequest = Omit<PayableRequest, "lines" | "received_amount" | "invoiced_amount" | "receipts"> & {
  purchase_request_items: (Omit<ReceiptLine, "received"> & {
    goods_receipt_items: { quantity: number }[];
  })[];
  goods_receipts: PayableRequest["receipts"];
  invoices: { amount: number }[];
};

export const fetchRequests = async (): Promise<PayableRequest[]> => {
  const r = await request<{ proc_purchase_request: RawRequest[] }>(REQUESTS);
  return r.proc_purchase_request.map(({ purchase_request_items, goods_receipts, invoices, ...rest }) => ({
    ...rest,
    lines: purchase_request_items.map(({ goods_receipt_items, ...line }) => ({
      ...line,
      received: goods_receipt_items.reduce((s, g) => s + Number(g.quantity), 0),
    })),
    receipts: goods_receipts,
    received_amount: goods_receipts.reduce((s, g) => s + Number(g.amount), 0),
    invoiced_amount: invoices.reduce((s, i) => s + Number(i.amount), 0),
  }));
};

export const fetchInvoices = async () => (await request<{ fin_invoice: Invoice[] }>(INVOICES)).fin_invoice;

export const fetchNetting = async () => {
  const r = await request<{ fin_netting: Netting[]; netting_overview: { data: NettingOverview } }>(NETTINGS);
  return { history: r.fin_netting, overview: r.netting_overview.data };
};

type Doc = { id: string; doc_no: string };

export const postGoodsReceipt = async (
  requestId: string,
  lines: { request_item_id: string; quantity: number }[],
  note?: string,
) =>
  (
    await request<{ post_goods_receipt: Doc }>(
      `mutation PostGoodsReceipt($r: uuid!, $l: jsonb!, $n: String) {
        post_goods_receipt(request_id: $r, lines: $l, note: $n) { id doc_no } }`,
      { r: requestId, l: lines, n: note || null },
    )
  ).post_goods_receipt;

export const recordInvoice = async (input: {
  requestId: string;
  number: string;
  invoiceDate: string;
  dueDate?: string | null;
  amount: number;
}) =>
  (
    await request<{ record_invoice: Doc }>(
      `mutation RecordInvoice($r: uuid!, $no: String!, $d: date!, $a: numeric!, $due: date) {
        record_invoice(request_id: $r, supplier_invoice_no: $no, invoice_date: $d, amount: $a, due_date: $due) {
          id doc_no } }`,
      { r: input.requestId, no: input.number, d: input.invoiceDate, a: input.amount, due: input.dueDate || null },
    )
  ).record_invoice;

export const voidInvoice = async (invoiceId: string) =>
  (
    await request<{ void_invoice: Doc }>(
      `mutation VoidInvoice($i: uuid!) { void_invoice(invoice_id: $i) { id doc_no } }`,
      { i: invoiceId },
    )
  ).void_invoice;

export const recordPayment = async (invoiceId: string, amount: number, method: string, reference?: string) =>
  (
    await request<{ record_payment: Doc }>(
      `mutation RecordPayment($i: uuid!, $a: numeric!, $m: String!, $ref: String) {
        record_payment(invoice_id: $i, amount: $a, method: $m, reference: $ref) { id doc_no } }`,
      { i: invoiceId, a: amount, m: method, ref: reference || null },
    )
  ).record_payment;

export const runNetting = async (a: string, b: string, note?: string) =>
  (
    await request<{ run_netting: Doc }>(
      `mutation RunNetting($a: uuid!, $b: uuid!, $n: String) {
        run_netting(company_a: $a, company_b: $b, note: $n) { id doc_no } }`,
      { a, b, n: note || null },
    )
  ).run_netting;
