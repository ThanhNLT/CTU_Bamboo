// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Chuỗi duyệt của lần gửi gần nhất và lịch sử duyệt, dùng cho mọi loại chứng từ (wf.approval_step,
// wf.approval_history là bảng đa hình).
import { Card, Space, Steps, Tag, Timeline, Typography } from "antd";
import type { ApprovalHistory, ApprovalStep } from "../document/types";
import { ESCALATION_REASON, formatDate, HISTORY_EVENT, STEP_STATUS } from "../../utils/format";

const stepState = (s: string): "wait" | "process" | "finish" | "error" =>
  s === "ACTIVE" ? "process" : s === "APPROVED" ? "finish" : s === "REJECTED" || s === "RETURNED" ? "error" : "wait";

type Props = { round: number; steps: ApprovalStep[]; history: ApprovalHistory[]; emptyHint: string };

export const ApprovalPanel = ({ round, steps, history, emptyHint }: Props) => {
  const current = steps.filter((s) => s.round === round);
  return (
    <>
      <Card size="small" title={round ? `Chuỗi duyệt (lần gửi ${round})` : "Chuỗi duyệt"}>
        {current.length === 0 ? <Typography.Text type="secondary">{emptyHint}</Typography.Text> : (
          <Steps direction="vertical" size="small" items={current.map((s) => {
            const open = s.tasks[0];
            return {
              status: stepState(s.status),
              title: `${s.position?.name ?? ""} – ${s.position?.org_unit.name ?? ""}`,
              description: (
                <Space direction="vertical" size={0}>
                  <span>{STEP_STATUS[s.status] ?? s.status}{s.acted_by_person ? `: ${s.acted_by_person.full_name}` : ""}
                    {s.on_behalf_of_person ? ` (duyệt thay ${s.on_behalf_of_person.full_name})` : ""}</span>
                  {open?.escalated && <Tag color="orange">Đẩy lên cấp trên: {ESCALATION_REASON[open.escalation_reason ?? ""]}</Tag>}
                  {open && !open.assignee_id && <Tag color="red">Chờ có người giữ vị trí</Tag>}
                  {s.note && <Typography.Text type="secondary" italic>“{s.note}”</Typography.Text>}
                  {s.acted_at && <Typography.Text type="secondary">{formatDate(s.acted_at)}</Typography.Text>}
                </Space>
              ),
            };
          })} />
        )}
      </Card>
      <Card size="small" title="Lịch sử" style={{ marginTop: 16 }}>
        <Timeline items={history.map((h) => ({
          children: (
            <>
              <b>{HISTORY_EVENT[h.event] ?? h.event}</b>{h.person ? ` – ${h.person.full_name}` : ""}
              {h.on_behalf_of_person ? ` (thay ${h.on_behalf_of_person.full_name})` : ""}
              {typeof h.detail?.note === "string" && <div><i>“{h.detail.note}”</i></div>}
              {typeof h.detail?.reason === "string" && <div><i>{ESCALATION_REASON[h.detail.reason] ?? h.detail.reason}</i></div>}
              <div><Typography.Text type="secondary">{formatDate(h.created_at)}</Typography.Text></div>
            </>
          ),
        }))} />
      </Card>
    </>
  );
};
