// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

type Person = { full_name: string } | null;

export type PurchaseRequest = {
  id: string; doc_no: string; title: string; description: string | null; status: string; total_amount: number;
  category_code: string | null; needed_by: string | null; approval_round: number; created_at: string; updated_at: string;
  requester_id: string; requester_position_id: string; partner_id: string | null;
  requester: Person; requester_position: { name: string } | null; org_unit: { name: string } | null;
  partner: { code: string; name: string } | null;
  purchase_request_items: {
    id: string; line_no: number; item_id: string | null; description: string; uom: string; quantity: number;
    unit_price: number; amount: number; note: string | null; item: { code: string } | null;
  }[];
  approval_steps: {
    id: string; round: number; step_order: number; status: string; acted_at: string | null; note: string | null;
    position: { name: string; org_unit: { name: string } } | null;
    acted_by_person: Person; on_behalf_of_person: Person;
    tasks: { id: string; assignee_id: string | null; escalated: boolean; escalation_reason: string | null }[];
  }[];
  approval_history: {
    id: number; event: string; detail: Record<string, unknown>; created_at: string; person: Person; on_behalf_of_person: Person;
  }[];
  comments: {
    id: string; body: string; created_at: string; edited_at: string | null; deleted_at: string | null;
    parent_id: string | null; author_id: string; author: Person;
  }[];
  attachments: {
    id: string; file_name: string; content_type: string; size_bytes: number; status: string; scan_result: string | null;
    created_at: string; uploaded_by: string; uploaded_by_person: Person;
  }[];
};
