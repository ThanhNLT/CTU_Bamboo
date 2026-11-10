/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { request } from "../../api/client";
import { uploadContentType } from "../../utils/fileType";
import { tr, trf } from "../../i18n";
import type { Member, Message, Person } from "./types";

const MESSAGE = `id sender_id body created_at edited_at deleted_at reply_to_id mentions
  sender { full_name } attachment { id file_name content_type size_bytes status }`;

/** Danh sách cuộc trò chuyện của người gọi, mới nhất trước, kèm số tin chưa đọc (live query). */
export const CONVERSATIONS = `subscription Conversations($me: uuid!) {
  chat_conversation(order_by: [{last_message_at: desc_nulls_last}, {created_at: desc}], limit: 300) {
    id kind title display_name unread last_preview last_message_at org_unit_id
    members(where: {person_id: {_eq: $me}}) { muted role }
    peer: members(where: {person_id: {_neq: $me}, left_at: {_is_null: true}}, limit: 1) { person_id }
  }
}`;

/** Tổng tin chưa đọc cho huy hiệu trên menu (bỏ cuộc đã tắt thông báo). */
export const UNREAD = `subscription Unread($me: uuid!) {
  chat_conversation(where: {members: {person_id: {_eq: $me}, muted: {_eq: false}, left_at: {_is_null: true}}}) {
    id unread
  }
}`;

/** 100 tin gần nhất của cuộc đang mở (live query: tin mới, sửa, thu hồi đều hiện ngay). */
export const LATEST = `subscription Latest($c: uuid!) {
  chat_message(where: {conversation_id: {_eq: $c}}, order_by: {id: desc}, limit: 100) { ${MESSAGE} }
}`;

export const MEMBERS = `subscription Members($c: uuid!) {
  chat_member(where: {conversation_id: {_eq: $c}, left_at: {_is_null: true}}, order_by: {person: {full_name: asc}}) {
    person_id role source last_read_id person { full_name }
  }
}`;

export const fetchOlder = async (conversation: string, before: number) => {
  const { chat_message } = await request<{ chat_message: Message[] }>(
    `query($c: uuid!, $b: bigint!) {
       chat_message(where: {conversation_id: {_eq: $c}, id: {_lt: $b}}, order_by: {id: desc}, limit: 50) { ${MESSAGE} } }`,
    { c: conversation, b: before },
  );
  return chat_message;
};

export const searchMessages = async (conversation: string, text: string) => {
  const { chat_message } = await request<{ chat_message: Message[] }>(
    `query($c: uuid!, $q: String!) {
       chat_message(where: {conversation_id: {_eq: $c}, body: {_ilike: $q}, deleted_at: {_is_null: true}},
                    order_by: {id: desc}, limit: 30) { ${MESSAGE} } }`,
    { c: conversation, q: `%${text.replace(/[%_\\]/g, (m) => `\\${m}`)}%` },
  );
  return chat_message;
};

export const searchPeople = async (text: string, except: string) => {
  const { core_person } = await request<{ core_person: Person[] }>(
    `query($q: String!, $me: uuid!) {
       core_person(where: {full_name: {_ilike: $q}, id: {_neq: $me}}, order_by: {full_name: asc}, limit: 20) {
         id full_name } }`,
    { q: `%${text}%`, me: except },
  );
  return core_person;
};

/** Mảng uuid của PostgreSQL gửi qua GraphQL dưới dạng chuỗi `{a,b}`. */
const pgArray = (ids: string[]) => `{${ids.join(",")}}`;

export const sendMessage = async (input: {
  conversation_id: string;
  body: string;
  reply_to_id?: number | null;
  attachment_id?: string | null;
  mentions?: string[];
}) => {
  const { insert_chat_message_one } = await request<{ insert_chat_message_one: { id: number } }>(
    `mutation($o: chat_message_insert_input!) { insert_chat_message_one(object: $o) { id } }`,
    { o: { ...input, mentions: pgArray(input.mentions ?? []) } },
  );
  return insert_chat_message_one.id;
};

export const editMessage = async (id: number, body: string) => {
  await request(
    `mutation($id: bigint!, $b: String!) { update_chat_message_by_pk(pk_columns: {id: $id}, _set: {body: $b}) { id } }`,
    {
      id,
      b: body,
    },
  );
};

export const recallMessage = async (id: number) => {
  await request(
    `mutation($id: bigint!) { update_chat_message_by_pk(pk_columns: {id: $id}, _set: {deleted_at: "now()"}) { id } }`,
    { id },
  );
};

export const markRead = async (conversation: string, me: string, id: number) => {
  await request(
    `mutation($c: uuid!, $p: uuid!, $id: bigint!) {
       update_chat_member_by_pk(pk_columns: {conversation_id: $c, person_id: $p}, _set: {last_read_id: $id}) { last_read_id } }`,
    { c: conversation, p: me, id },
  );
};

export const setMuted = async (conversation: string, me: string, muted: boolean) => {
  await request(
    `mutation($c: uuid!, $p: uuid!, $m: Boolean!) {
       update_chat_member_by_pk(pk_columns: {conversation_id: $c, person_id: $p}, _set: {muted: $m}) { muted } }`,
    { c: conversation, p: me, m: muted },
  );
};

export const openDirect = async (person: string) => {
  const { chat_open_direct } = await request<{ chat_open_direct: { conversation_id: string } }>(
    `mutation($p: uuid!) { chat_open_direct(person_id: $p) { conversation_id } }`,
    { p: person },
  );
  return chat_open_direct.conversation_id;
};

export const createGroup = async (title: string, members: string[]) => {
  const { chat_create_group } = await request<{ chat_create_group: { conversation_id: string } }>(
    `mutation($t: String!, $m: [uuid!]!) { chat_create_group(title: $t, member_ids: $m) { conversation_id } }`,
    { t: title, m: members },
  );
  return chat_create_group.conversation_id;
};

export const updateGroup = async (
  conversation: string,
  change: { title?: string; add_ids?: string[]; remove_ids?: string[] },
) => {
  await request(
    `mutation($c: uuid!, $t: String, $a: [uuid!], $r: [uuid!]) {
       chat_update_group(conversation_id: $c, title: $t, add_ids: $a, remove_ids: $r) { members } }`,
    { c: conversation, t: change.title, a: change.add_ids, r: change.remove_ids },
  );
};

export const leave = async (conversation: string) => {
  await request(`mutation($c: uuid!) { chat_leave(conversation_id: $c) { left } }`, { c: conversation });
};

const MAX_BYTES = 25 * 1024 * 1024;

/** Tải tệp lên kho tệp đính kèm (quét virus), trả mã tệp để gắn vào tin nhắn. */
export const uploadFile = async (conversation: string, file: File) => {
  if (file.size > MAX_BYTES) throw new Error(tr("Tệp phải nhỏ hơn 25 MB"));
  const { get_upload_url: t } = await request<{
    get_upload_url: { attachment_id: string; upload_url: string; content_type: string };
  }>(
    `mutation($id: uuid!, $name: String!, $type: String!, $size: Int!) {
       get_upload_url(entity_type: "chat.conversation", entity_id: $id, file_name: $name, content_type: $type, size_bytes: $size) {
         attachment_id upload_url content_type } }`,
    { id: conversation, name: file.name, type: uploadContentType(file), size: file.size },
  );
  const res = await fetch(t.upload_url, { method: "PUT", headers: { "Content-Type": t.content_type }, body: file });
  if (!res.ok) throw new Error(trf("Tải lên kho lưu trữ thất bại ({0})", [res.status]));
  const { confirm_upload: r } = await request<{ confirm_upload: { status: string; scan_result: string | null } }>(
    `mutation($a: uuid!) { confirm_upload(attachment_id: $a) { status scan_result } }`,
    { a: t.attachment_id },
  );
  if (r.status !== "CLEAN") throw new Error(r.scan_result ?? r.status);
  return t.attachment_id;
};

export const downloadUrl = async (attachment: string) => {
  const { get_download_url } = await request<{ get_download_url: { url: string } }>(
    `query($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
    { a: attachment },
  );
  return get_download_url.url;
};

export type { Member };
