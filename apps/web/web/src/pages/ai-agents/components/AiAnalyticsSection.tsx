// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Select, Switch } from "antd";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";
import { GUARD_INFO, MODELS } from "../mock";
import type { Agent, AnalyticsTab, GuardKey } from "../types";
import { num, pct, toolShares, weekTotals } from "../utils";
import { SecurityEventsList } from "./SecurityEventsList";
import { SessionsChart } from "./SessionsChart";
import { ToolsUsageList } from "./ToolsUsageList";

const TABS: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "overview", label: "Tổng quan" },
  { key: "sessions", label: "Phiên" },
  { key: "tools", label: "Công cụ" },
  { key: "guards", label: "Rào chắn" },
  { key: "config", label: "Cấu hình" },
];

const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card", className)}>{children}</div>
);

const Kicker = ({ children }: { children: string }) => (
  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
);

const th = "border-b border-line py-2 pr-3 text-left text-[11.5px] font-medium text-muted";
const td = "border-b border-line/70 py-2.5 pr-3 align-top";

const Overview = ({ agent }: { agent: Agent }) => {
  const totals = weekTotals(agent);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SessionsChart data={agent.week} total={totals.total} errors={totals.errors} />
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-ink">Công cụ được gọi</h3>
          <span className="text-[11.5px] text-muted">24 giờ</span>
        </div>
        <div className="mt-3">
          <ToolsUsageList tools={toolShares(agent)} />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <Kicker>Sự kiện rào chắn · 24 giờ</Kicker>
          <div className="mt-3">
            <SecurityEventsList events={agent.events} limit={3} />
          </div>
        </div>
      </Card>
    </div>
  );
};

const Sessions = ({ agent }: { agent: Agent }) => (
  <Card>
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[14px] font-semibold text-ink">Phiên gần đây</h3>
      <span className="text-[11.5px] text-muted">Người dùng hiển thị rút gọn · nội dung lưu 30 ngày</span>
    </div>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-[12.5px]">
        <thead>
          <tr><th className={th}>Lúc</th><th className={th}>Người dùng</th><th className={th}>Câu hỏi</th><th className={th}>Công cụ</th><th className={th}>Thời gian</th><th className={th}>Kết quả</th></tr>
        </thead>
        <tbody>
          {agent.sessions.map((s) => (
            <tr key={s.id}>
              <td className={cn(td, "tabular-nums text-body")}>{s.at}</td>
              <td className={cn(td, "whitespace-nowrap text-body")}>{s.user}</td>
              <td className={cn(td, "text-ink")}>{s.question}</td>
              <td className={cn(td, "font-mono text-[11.5px] text-body")}>{s.tools.join(", ")}</td>
              <td className={cn(td, "whitespace-nowrap tabular-nums text-body")}>{num(s.seconds, 1)} giây</td>
              <td className={td}>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className={cn("h-1.5 w-1.5 rounded-full", s.ok ? "bg-bamboo-500" : "bg-red-500")} aria-hidden />
                  {s.ok ? "Thành công" : "Lỗi"}
                  {s.rating === "up" && <ThumbsUp className="h-3.5 w-3.5 text-bamboo-600" aria-label="Hữu ích" />}
                  {s.rating === "down" && <ThumbsDown className="h-3.5 w-3.5 text-red-600" aria-label="Chưa tốt" />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
);

const Tools = ({ agent }: { agent: Agent }) => (
  <Card>
    <h3 className="text-[14px] font-semibold text-ink">Công cụ · 24 giờ</h3>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
        <thead>
          <tr><th className={th}>Công cụ</th><th className={cn(th, "text-right")}>Lượt gọi</th><th className={cn(th, "text-right")}>Lỗi</th><th className={cn(th, "text-right")}>p95</th><th className={th}>Phạm vi dữ liệu</th></tr>
        </thead>
        <tbody>
          {agent.toolStats.map((t) => (
            <tr key={t.name}>
              <td className={cn(td, "font-mono text-[12px] text-ink")}>{t.name}</td>
              <td className={cn(td, "text-right tabular-nums")}>{num(t.calls)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{pct(t.calls ? t.errors / t.calls : 0)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{num(t.p95, 1)} giây</td>
              <td className={cn(td, "text-body")}>{t.scope}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="mt-3 text-[11.5px] text-muted">Công cụ chạy bằng quyền của người hỏi; dữ liệu tự lọc theo công ty (tenant_id).</p>
  </Card>
);

const Guards = ({ agent, onToggle }: { agent: Agent; onToggle: (g: GuardKey, on: boolean) => void }) => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card>
      <h3 className="text-[14px] font-semibold text-ink">Rào chắn đang bật</h3>
      <ul className="m-0 mt-3 list-none space-y-3 p-0">
        {(Object.keys(GUARD_INFO) as GuardKey[]).map((g) => (
          <li key={g} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-mono text-[12.5px] text-ink">{GUARD_INFO[g].label}</span>
              <span className="block text-[12px] text-muted">{GUARD_INFO[g].description}</span>
            </span>
            <Switch checked={agent.guards[g]} onChange={(on) => onToggle(g, on)} aria-label={`Bật ${GUARD_INFO[g].label}`} />
          </li>
        ))}
      </ul>
    </Card>
    <Card>
      <Kicker>Sự kiện rào chắn · 24 giờ</Kicker>
      <div className="mt-3">
        <SecurityEventsList events={agent.events} />
      </div>
    </Card>
  </div>
);

const Config = ({ agent, onModelChange }: { agent: Agent; onModelChange: (m: string) => void }) => {
  const rows: Array<[string, ReactNode]> = [
    ["Mô hình", <Select key="m" value={agent.model} onChange={onModelChange} options={MODELS.map((m) => ({ value: m, label: m }))} style={{ width: 160 }} aria-label="Mô hình" />],
    ["Temperature", num(agent.config.temperature, 1)],
    ["Độ dài trả lời tối đa", `${num(agent.config.maxTokens)} token`],
    ["Phạm vi dữ liệu", agent.config.scopes.join(", ")],
    ["Lưu phiên", `${agent.config.retentionDays} ngày · không dùng để huấn luyện`],
  ];
  return (
    <Card>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[12.5px] text-muted sm:pt-1">{k}</dt>
            <dd className="m-0 text-[13px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-line pt-4">
        <Kicker>Chỉ dẫn hệ thống (trích)</Kicker>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-canvas p-3 font-mono text-[12px] leading-relaxed text-body">{agent.config.systemPrompt}</pre>
      </div>
    </Card>
  );
};

/** Phần phân tích của tác tử đang chọn: tab Tổng quan / Phiên / Công cụ / Rào chắn / Cấu hình. */
export const AiAnalyticsSection = ({
  agent, tab, onTabChange, onToggleGuard, onModelChange,
}: {
  agent: Agent;
  tab: AnalyticsTab;
  onTabChange: (t: AnalyticsTab) => void;
  onToggleGuard: (g: GuardKey, on: boolean) => void;
  onModelChange: (m: string) => void;
}) => (
  <section aria-label={`Phân tích ${agent.name}`} className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{agent.name}</h2>
      <div role="tablist" aria-label="Phân tích tác tử" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-black/[0.045] p-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                active ? "bg-white font-semibold text-ink shadow-card" : "text-body hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
    <div role="tabpanel">
      {tab === "overview" && <Overview agent={agent} />}
      {tab === "sessions" && <Sessions agent={agent} />}
      {tab === "tools" && <Tools agent={agent} />}
      {tab === "guards" && <Guards agent={agent} onToggle={onToggleGuard} />}
      {tab === "config" && <Config agent={agent} onModelChange={onModelChange} />}
    </div>
  </section>
);
