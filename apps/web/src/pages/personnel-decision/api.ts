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

export type DecisionType = "APPOINT" | "TRANSFER" | "DISMISS";
export type AssignmentKind = "PRIMARY" | "CONCURRENT" | "ACTING";

export type Decision = {
  id: string;
  doc_no: string;
  decision_type: DecisionType;
  assignment_type: AssignmentKind;
  effective_date: string;
  reason: string;
  created_at: string;
  person_name: string;
  employee_code: string | null;
  issuer_name: string;
  source_position: string | null;
  source_unit: string | null;
  target_position: string | null;
  target_unit: string | null;
};

export type PersonAssignment = { position_id: string; position: string; unit: string; type: AssignmentKind };
export type PersonOption = {
  id: string;
  full_name: string;
  employee_code: string | null;
  assignments: PersonAssignment[];
};
export type PositionOption = { id: string; name: string; unit: string; is_head: boolean; holder: string | null };

export const listDecisions = async () =>
  (
    await request<{ personnel_decisions: { can_issue: boolean; decisions: Decision[] } }>(
      `query { personnel_decisions { can_issue decisions } }`,
    )
  ).personnel_decisions;

export const decisionContext = async () =>
  (
    await request<{ personnel_decision_context: { people: PersonOption[]; positions: PositionOption[] } }>(
      `query { personnel_decision_context { people positions } }`,
    )
  ).personnel_decision_context;

export type IssueInput = {
  decisionType: DecisionType;
  personId: string;
  sourcePositionId?: string;
  targetPositionId?: string;
  assignmentType?: AssignmentKind;
  effectiveDate: string;
  reason: string;
};

export const issueDecision = async (i: IssueInput) =>
  (
    await request<{ issue_personnel_decision: { id: string; doc_no: string } }>(
      `mutation Issue($t: String!, $p: uuid!, $s: uuid, $d: uuid, $k: String, $e: date!, $r: String!) {
        issue_personnel_decision(decision_type: $t, person_id: $p, source_position_id: $s, target_position_id: $d,
          assignment_type: $k, effective_date: $e, reason: $r) { id doc_no } }`,
      {
        t: i.decisionType,
        p: i.personId,
        s: i.sourcePositionId ?? null,
        d: i.targetPositionId ?? null,
        k: i.assignmentType ?? null,
        e: i.effectiveDate,
        r: i.reason,
      },
    )
  ).issue_personnel_decision;

export const decisionPdf = async (id: string) =>
  (
    await request<{ get_personnel_decision_pdf: { url: string; file_name: string; check_code: string } }>(
      `query Pdf($id: uuid!) { get_personnel_decision_pdf(decision_id: $id) { url file_name check_code } }`,
      { id },
    )
  ).get_personnel_decision_pdf;
