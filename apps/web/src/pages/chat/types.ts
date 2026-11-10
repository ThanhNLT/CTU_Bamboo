/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

export type ConversationKind = "DIRECT" | "GROUP" | "UNIT";

export type Conversation = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  display_name: string | null;
  unread: number;
  last_preview: string | null;
  last_message_at: string | null;
  org_unit_id: string | null;
  members: { muted: boolean; role: "OWNER" | "MEMBER" }[];
  peer: { person_id: string }[];
};

export type Member = {
  person_id: string;
  role: "OWNER" | "MEMBER";
  source: "MANUAL" | "UNIT";
  last_read_id: number;
  person: { full_name: string };
};

export type ChatAttachment = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
};

export type Message = {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: number | null;
  mentions: string[];
  sender: { full_name: string };
  attachment: ChatAttachment | null;
};

export type Person = { id: string; full_name: string };
