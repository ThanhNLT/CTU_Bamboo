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

import type { ApprovalHistory, ApprovalStep } from "../../components/document/types";
import { tr } from "../../i18n";

export type Transfer = {
  id: string;
  doc_no: string;
  status: string;
  approval_round: number;
  created_at: string;
  updated_at: string;
  effective_date: string;
  reason: string;
  requester_id: string;
  requester_kind: "SELF" | "MANAGER" | "EXECUTIVE";
  person_id: string;
  source_position_id: string;
  target_unit_id: string;
  target_position_id: string | null;
  requester: { full_name: string } | null;
  requester_position: { name: string; org_unit: { name: string } } | null;
  person: { full_name: string; employee_code: string | null } | null;
  source_position: { name: string; org_unit: { name: string } } | null;
  target_unit: { name: string } | null;
  target_position: { name: string } | null;
  approval_steps: ApprovalStep[];
  approval_history: ApprovalHistory[];
};

export const REQUESTER_KIND: Record<string, string> = {
  SELF: tr("Nhân viên tự đề nghị"),
  MANAGER: tr("Trưởng đơn vị đề nghị"),
  EXECUTIVE: tr("Phòng nhân sự / lãnh đạo đề nghị"),
};

export type CrossTransfer = {
  id: string;
  doc_no: string;
  status: string;
  stage: "SOURCE" | "TARGET" | "GROUP" | "DONE";
  approval_round: number;
  created_at: string;
  updated_at: string;
  effective_date: string;
  reason: string;
  requester_id: string;
  requester_kind: "SELF" | "MANAGER" | "EXECUTIVE";
  person_id: string;
  person_name: string;
  source_position_id: string;
  target_tenant_id: string;
  target_unit_name: string;
  requester: { full_name: string } | null;
  requester_position: { name: string; org_unit: { name: string } } | null;
  source_position: { name: string; org_unit: { name: string } } | null;
  approval_steps: ApprovalStep[];
  approval_history: ApprovalHistory[];
};

export const STAGE_LABEL: Record<string, string> = {
  SOURCE: tr("Tenant nguồn duyệt"),
  TARGET: tr("Tenant đích tiếp nhận"),
  GROUP: tr("Tập đoàn quyết định"),
  DONE: tr("Đã kết thúc"),
};

export type LegTransfer = {
  id: string;
  doc_no: string;
  status: string;
  approval_round: number;
  effective_date: string;
  person_name: string;
  target_unit_id?: string;
  target_position_id?: string | null;
  target_unit?: { name: string } | null;
  target_position?: { name: string } | null;
  approval_steps: ApprovalStep[];
  approval_history: ApprovalHistory[];
};
