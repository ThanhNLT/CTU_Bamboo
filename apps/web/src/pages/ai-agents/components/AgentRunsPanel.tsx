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

import { Tooltip } from "antd";
import { CheckCircle2, CircleDashed, CircleSlash, XCircle } from "lucide-react";

import { cn } from "../../../utils/cn";
import { formatAgo } from "../../../utils/format";
import type { Agent, AgentRun, Option, RunAction } from "../types";
import { tr, trf } from "../../../i18n";

const STATUS: Record<AgentRun["status"], { label: string; className: string }> = {
  queued: { label: tr("Đang chờ"), className: "bg-black/[0.05] text-body" },
  running: { label: tr("Đang chạy"), className: "bg-sky-50 text-sky-800" },
  done: { label: tr("Đã xong"), className: "bg-bamboo-50 text-bamboo-800" },
  error: { label: tr("Lỗi"), className: "bg-red-50 text-red-800" },
  skipped: { label: tr("Bỏ qua"), className: "bg-amber-50 text-amber-900" },
};
const RISK: Record<string, { label: string; className: string }> = {
  low: { label: tr("Rủi ro thấp"), className: "text-bamboo-700" },
  medium: { label: tr("Rủi ro trung bình"), className: "text-amber-700" },
  high: { label: tr("Rủi ro cao"), className: "text-red-700" },
};
const ACTION: Record<string, string> = {
  comment: tr("Bình luận"),
  notify: tr("Thông báo"),
  webhook: "Webhook",
  return_for_info: tr("Trả lại để bổ sung"),
  project_task: tr("Công việc dự án"),
};
const TARGET: Record<string, string> = {
  requester: tr("người lập"),
  approvers: tr("người đang duyệt"),
  owner: tr("người phụ trách"),
};

const ActionChip = ({ a }: { a: RunAction }) => {
  const pending = a.dry_run || a.suggested;
  const Icon = pending ? CircleDashed : a.ok ? CheckCircle2 : XCircle;
  const detail = a.text ?? a.message ?? a.note ?? a.name ?? "";
  const label = a.type === "notify" && a.to ? `${ACTION.notify} → ${TARGET[a.to] ?? a.to}` : ACTION[a.type];
  return (
    <Tooltip title={[detail, a.error].filter(Boolean).join(" · ") || undefined}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]",
          pending ? "bg-black/[0.045] text-body" : a.ok ? "bg-bamboo-50 text-bamboo-800" : "bg-red-50 text-red-800",
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {label}
        {a.dry_run ? ` (${tr("đề xuất")})` : ""}
        {a.suggested ? ` (${tr("chờ chấp nhận")})` : ""}
      </span>
    </Tooltip>
  );
};

export const AgentRunsPanel = ({ runs, agents, events }: { runs: AgentRun[]; agents: Agent[]; events: Option[] }) => {
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const eventLabel = new Map([
    ...events.map((e): [string, string] => [e.code, tr(e.label)]),
    ["process.ai_step", tr("Bước AI trong quy trình tự động")],
  ]);
  return (
    <section
      aria-label={tr("Tác tử tự hành động")}
      className="rounded-2xl border border-line bg-surface p-5 shadow-card"
    >
      <h2 className="text-[15px] font-semibold text-ink">{tr("Tác tử tự hành động")}</h2>
      <p className="mt-0.5 text-[12px] text-muted">
        {tr("Lần chạy gần đây khi có sự kiện nghiệp vụ: nhận xét của tác tử và hành động đã làm.")}
      </p>
      {runs.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
          <CircleSlash className="h-4 w-4" aria-hidden />
          {tr("Chưa có lần chạy. Bấm biểu tượng tia sét ở một tác tử để chọn sự kiện kích hoạt.")}
        </p>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-line/70 p-0">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("rounded-ui px-2 py-0.5 text-[11px]", STATUS[r.status].className)}>
                  {STATUS[r.status].label}
                </span>
                <span className="font-semibold text-ink">{agentName.get(r.agent_id) ?? "—"}</span>
                <span className="text-muted">
                  {eventLabel.get(r.event) ?? r.event}
                  {r.payload?.doc_no ? ` · ${r.payload.doc_no}` : ""}
                </span>
                {r.risk && <span className={cn("text-[11.5px]", RISK[r.risk].className)}>{RISK[r.risk].label}</span>}
                <span className="ml-auto text-[11.5px] text-muted">{formatAgo(r.created_at)}</span>
              </div>
              {r.assessment && <p className="m-0 text-body">{r.assessment}</p>}
              {r.error && <p className="m-0 text-red-700">{r.error}</p>}
              {(r.actions.length > 0 || (r.plan?.rejected?.length ?? 0) > 0) && (
                <div className="flex flex-wrap items-center gap-1">
                  {r.actions.map((a, n) => (
                    <ActionChip key={n} a={a} />
                  ))}
                  {(r.plan?.rejected?.length ?? 0) > 0 && (
                    <Tooltip title={r.plan!.rejected!.map((x) => `${x.action}: ${x.reason}`).join("; ")}>
                      <span className="text-[11px] text-muted">
                        {trf("{0} hành động bị chặn", [r.plan!.rejected!.length])}
                      </span>
                    </Tooltip>
                  )}
                  {(r.plan?.sources?.length ?? 0) > 0 && (
                    <span className="text-[11px] text-muted">{trf("Căn cứ: {0}", [r.plan!.sources!.join(", ")])}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
