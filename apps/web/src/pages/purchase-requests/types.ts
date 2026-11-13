/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import type { ApprovalHistory, ApprovalStep, Attachment, Comment } from "../../components/document/types";

type Person = { full_name: string } | null;

export type PurchaseRequest = {
  id: string;
  doc_no: string;
  title: string;
  description: string | null;
  status: string;
  total_amount: number;
  category_code: string | null;
  needed_by: string | null;
  approval_round: number;
  created_at: string;
  updated_at: string;
  requester_id: string;
  requester_position_id: string;
  partner_id: string | null;
  proposed_partner_name: string | null;
  proposed_partner_tax_code: string | null;
  requester: Person;
  requester_position: { name: string } | null;
  org_unit: { name: string } | null;
  partner: { code: string; name: string; internal_unit_id: string | null } | null;
  ic_order: { id: string; doc_no: string; status: string } | null;
  purchase_request_items: {
    id: string;
    line_no: number;
    item_id: string | null;
    description: string;
    uom: string;
    quantity: number;
    unit_price: number;
    amount: number;
    note: string | null;
    item: { code: string } | null;
  }[];
  approval_steps: ApprovalStep[];
  approval_history: ApprovalHistory[];
  comments: Comment[];
  attachments: Attachment[];
};
