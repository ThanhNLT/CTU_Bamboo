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
import { tr } from "../../i18n";

type Person = { full_name: string } | null;

export type Onboarding = {
  id: string;
  doc_no: string;
  status: string;
  approval_round: number;
  created_at: string;
  updated_at: string;
  requester_id: string;
  requester_position_id: string;
  full_name: string;
  gender: string | null;
  date_of_birth: string | null;
  work_email: string | null;
  phone: string | null;
  education: string | null;
  major: string | null;
  target_position_id: string;
  start_date: string;
  contract_type: string;
  salary: number | null;
  note: string | null;
  bank_name: string | null;
  username: string | null;
  national_id_masked: string | null;
  bank_account_masked: string | null;
  address_masked: string | null;
  account_status: string;
  account_error: string | null;
  person_id: string | null;
  can_read_private: boolean;
  requester: Person;
  requester_position: { name: string } | null;
  org_unit: { name: string } | null;
  target_position: { name: string; org_unit: { name: string } } | null;
  person: { employee_code: string | null } | null;
  approval_steps: ApprovalStep[];
  approval_history: ApprovalHistory[];
  comments: Comment[];
  attachments: Attachment[];
};

export type OnboardingPrivate = {
  national_id: string | null;
  bank_account: string | null;
  address: string | null;
  username: string | null;
  initial_password: string | null;
};

export const GENDER: Record<string, string> = { MALE: tr("Nam"), FEMALE: tr("Nữ"), OTHER: tr("Khác") };
export const CONTRACT_TYPE: Record<string, string> = {
  PROBATION: tr("Thử việc"),
  FIXED_TERM: tr("Hợp đồng xác định thời hạn"),
  INDEFINITE: tr("Hợp đồng không xác định thời hạn"),
};
export const ACCOUNT_STATUS: Record<string, { label: string; color: string }> = {
  NONE: { label: tr("Không tạo tài khoản"), color: "default" },
  PENDING: { label: tr("Đang tạo tài khoản"), color: "processing" },
  CREATED: { label: tr("Đã có tài khoản"), color: "success" },
  FAILED: { label: tr("Chưa tạo được tài khoản"), color: "error" },
};
