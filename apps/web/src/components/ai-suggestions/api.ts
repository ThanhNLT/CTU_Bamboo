/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { request } from "../../api/client";

/** Đề xuất của tác tử AI mức `suggest` (ADR #85): người nhận sửa rồi chấp nhận, hoặc bỏ qua. */
export type AiSuggestion = {
  id: string;
  agent_name: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  action: {
    type: "return_for_info" | "project_task" | "comment" | "notify" | "webhook";
    note?: string;
    name?: string;
    description?: string;
    days?: number;
    text?: string;
    to?: string;
    message?: string;
  };
  status: string;
  reason: string | null;
  assessment: string | null;
  risk: string | null;
  project_code: string | null;
  project_name: string | null;
  created_at: string;
  expires_at: string;
};

const FIELDS =
  "id agent_name entity_type entity_id entity_label action status reason assessment risk project_code project_name created_at expires_at";

export const fetchAiSuggestions = async (entityType?: string, entityId?: string) => {
  const { ai_suggestion_list } = await request<{ ai_suggestion_list: AiSuggestion[] }>(
    `query($t: String, $e: uuid) { ai_suggestion_list(entity_type: $t, entity_id: $e) { ${FIELDS} } }`,
    { t: entityType ?? null, e: entityId ?? null },
  );
  return ai_suggestion_list;
};

export const decideAiSuggestion = async (
  id: string,
  decision: "ACCEPT" | "DISMISS",
  edits?: Record<string, unknown>,
) => {
  const { ai_suggestion_decide } = await request<{
    ai_suggestion_decide: { status: string; reason: string | null };
  }>(
    `mutation($id: uuid!, $d: String!, $x: jsonb) { ai_suggestion_decide(id: $id, decision: $d, edits: $x) {
       status reason } }`,
    { id, d: decision, x: edits ?? null },
  );
  return ai_suggestion_decide;
};
