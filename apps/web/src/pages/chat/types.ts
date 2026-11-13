/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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
