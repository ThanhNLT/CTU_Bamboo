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

import { Card, Space, Steps, Tag, Timeline, Typography } from "antd";

import type { ApprovalHistory, ApprovalStep } from "../document/types";
import { ESCALATION_REASON, formatDate, HISTORY_EVENT, STEP_STATUS } from "../../utils/format";
import { tr, trf } from "../../i18n";

const stepState = (s: string): "wait" | "process" | "finish" | "error" =>
  s === "ACTIVE" ? "process" : s === "APPROVED" ? "finish" : s === "REJECTED" || s === "RETURNED" ? "error" : "wait";

type Props = { round: number; steps: ApprovalStep[]; history: ApprovalHistory[]; emptyHint: string };

export const ApprovalPanel = ({ round, steps, history, emptyHint }: Props) => {
  const current = steps.filter((s) => s.round === round);
  return (
    <>
      <Card size="small" title={round ? trf("Chuỗi duyệt (lần gửi {0})", [round]) : tr("Chuỗi duyệt")}>
        {current.length === 0 ? (
          <Typography.Text type="secondary">{emptyHint}</Typography.Text>
        ) : (
          <Steps
            direction="vertical"
            size="small"
            items={current.map((s) => {
              const open = s.tasks[0];
              return {
                status: stepState(s.status),
                title: `${s.position?.name ?? ""} – ${s.position?.org_unit.name ?? ""}`,
                description: (
                  <Space direction="vertical" size={0}>
                    <span>
                      {STEP_STATUS[s.status] ?? s.status}
                      {s.acted_by_person ? `: ${s.acted_by_person.full_name}` : ""}
                      {s.on_behalf_of_person ? trf(" (duyệt thay {0})", [s.on_behalf_of_person.full_name]) : ""}
                    </span>
                    {open?.escalated && (
                      <Tag color="orange">
                        {tr("Đẩy lên cấp trên: ")} {ESCALATION_REASON[open.escalation_reason ?? ""]}
                      </Tag>
                    )}
                    {open && !open.assignee_id && <Tag color="red">{tr("Chờ có người giữ vị trí")}</Tag>}
                    {s.note && (
                      <Typography.Text type="secondary" italic>
                        “{s.note}”
                      </Typography.Text>
                    )}
                    {s.acted_at && <Typography.Text type="secondary">{formatDate(s.acted_at)}</Typography.Text>}
                  </Space>
                ),
              };
            })}
          />
        )}
      </Card>
      <Card size="small" title={tr("Lịch sử")} style={{ marginTop: 16 }}>
        <Timeline
          items={history.map((h) => ({
            children: (
              <>
                <b>{HISTORY_EVENT[h.event] ?? h.event}</b>
                {h.person ? ` – ${h.person.full_name}` : ""}
                {h.on_behalf_of_person ? ` (thay ${h.on_behalf_of_person.full_name})` : ""}
                {typeof h.detail?.note === "string" && (
                  <div>
                    <i>“{h.detail.note}”</i>
                  </div>
                )}
                {typeof h.detail?.reason === "string" && (
                  <div>
                    <i>{ESCALATION_REASON[h.detail.reason] ?? h.detail.reason}</i>
                  </div>
                )}
                <div>
                  <Typography.Text type="secondary">{formatDate(h.created_at)}</Typography.Text>
                </div>
              </>
            ),
          }))}
        />
      </Card>
    </>
  );
};
