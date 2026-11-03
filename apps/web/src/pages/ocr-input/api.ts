// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request } from "../../api/client";
import type { OcrDocument, RecentImport } from "./types";
import { trf } from "../../i18n";

export type PartnerOption = { id: string; code: string; name: string };
export type Options = {
  core_assignment: { position_id: string; assignment_type: string }[];
  mdm_partner: PartnerOption[];
};

export const loadOptions = (person: string) =>
  request<Options>(
    `query OcrOptions($person: uuid!) {
       core_assignment(where: {person_id: {_eq: $person}, assignment_type: {_in: ["PRIMARY", "CONCURRENT", "ACTING", "CONTRACT"]}}) {
         position_id assignment_type }
       mdm_partner(where: {is_active: {_eq: true}}, order_by: {name: asc}) { id code name }
     }`,
    { person },
  );

// Tệp đính kèm phải thuộc một chứng từ: tạo đề nghị mua sắm nháp làm nơi chứa bản quét, điền xong thì người dùng gửi duyệt
export const createDraft = async (positionId: string, title: string): Promise<string> =>
  (
    await request<{ insert_proc_purchase_request_one: { id: string } }>(
      `mutation OcrDraft($object: proc_purchase_request_insert_input!) { insert_proc_purchase_request_one(object: $object) { id } }`,
      { object: { title, requester_position_id: positionId } },
    )
  ).insert_proc_purchase_request_one.id;

export const uploadScan = async (
  requestId: string,
  file: File,
): Promise<{ attachmentId: string; status: string; scanResult: string | null }> => {
  const { get_upload_url: t } = await request<{
    get_upload_url: { attachment_id: string; upload_url: string; content_type: string };
  }>(
    `mutation OcrUp($id: uuid!, $name: String!, $type: String!, $size: Int!) {
       get_upload_url(entity_type: "proc.purchase_request", entity_id: $id, file_name: $name, content_type: $type, size_bytes: $size) {
         attachment_id upload_url content_type } }`,
    { id: requestId, name: file.name, type: file.type || "application/octet-stream", size: file.size },
  );
  const put = await fetch(t.upload_url, { method: "PUT", body: file, headers: { "Content-Type": t.content_type } });
  if (!put.ok) throw new Error(trf("Tải lên kho lưu trữ thất bại ({0})", [put.status]));
  const { confirm_upload: r } = await request<{ confirm_upload: { status: string; scan_result: string | null } }>(
    `mutation OcrConfirm($a: uuid!) { confirm_upload(attachment_id: $a) { status scan_result } }`,
    { a: t.attachment_id },
  );
  return { attachmentId: t.attachment_id, status: r.status, scanResult: r.scan_result };
};

export const getOcrDocument = async (attachmentId: string): Promise<OcrDocument> =>
  (
    await request<{ ocr_document: OcrDocument }>(
      `query OcrDoc($a: uuid!) { ocr_document(attachment_id: $a) {
         attachment_id file_name scan_status phase message ocr text parsed partner item_matches doc_label } }`,
      { a: attachmentId },
    )
  ).ocr_document;

export const retryOcr = async (attachmentId: string) => {
  await request(`mutation OcrRetry($a: uuid!) { ocr_retry(attachment_id: $a) { status } }`, { a: attachmentId });
};

export const downloadUrl = async (attachmentId: string): Promise<string> =>
  (
    await request<{ get_download_url: { url: string } }>(
      `query OcrDl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
      { a: attachmentId },
    )
  ).get_download_url.url;

export type Header = {
  title: string;
  description: string | null;
  category_code: string | null;
  partner_id: string | null;
  proposed_partner_name: string | null;
  proposed_partner_tax_code: string | null;
};

export type Line = {
  line_no: number;
  item_id: string | null;
  description: string;
  uom: string;
  quantity: string;
  unit_price: string;
  note: string | null;
};

export const saveImport = async (id: string, set: Header, lines: Line[]) => {
  await request(
    `mutation OcrSave($id: uuid!, $set: proc_purchase_request_set_input!, $items: [proc_purchase_request_item_insert_input!]!) {
       delete_proc_purchase_request_item(where: {request_id: {_eq: $id}}) { affected_rows }
       insert_proc_purchase_request_item(objects: $items) { affected_rows }
       update_proc_purchase_request_by_pk(pk_columns: {id: $id}, _set: $set) { id } }`,
    { id, set, items: lines.map((l) => ({ ...l, request_id: id })) },
  );
};

export const recentImports = async (person: string): Promise<RecentImport[]> =>
  (
    await request<{ core_attachment: RecentImport[] }>(
      `query OcrRecent($person: uuid!) {
         core_attachment(
           where: {uploaded_by: {_eq: $person}, entity_type: {_eq: "proc.purchase_request"}, deleted_at: {_is_null: true}, ocr: {status: {_in: ["DONE", "SKIPPED"]}}}
           order_by: {created_at: desc}, limit: 10) { id file_name created_at entity_id ocr { status } } }`,
      { person },
    )
  ).core_attachment;
