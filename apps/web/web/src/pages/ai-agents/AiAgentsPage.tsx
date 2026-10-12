// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Tác tử AI (Trí tuệ số): cổng quản trị các tác tử chạy trên Ollama nội bộ. Thẻ KPI tính từ bảng tác tử;
// bấm một dòng để xem phân tích (phiên 7 ngày, công cụ, rào chắn, cấu hình) của tác tử đó. Dữ liệu mẫu ở ./mock.
import { App } from "antd";
import { useMemo, useState } from "react";
import { AiAgentsHeader } from "./components/AiAgentsHeader";
import { AiAgentsTable } from "./components/AiAgentsTable";
import { AiAnalyticsSection } from "./components/AiAnalyticsSection";
import { AiKpiCards } from "./components/AiKpiCards";
import { RegisterAgentModal } from "./components/RegisterAgentModal";
import { AGENTS, DAYS, DEFAULT_AGENT_ID } from "./mock";
import type { Agent, AnalyticsTab, GuardKey } from "./types";
import { computeKpis } from "./utils";

export const AiAgentsPage = () => {
  const { message, modal } = App.useApp();
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [selectedId, setSelectedId] = useState(DEFAULT_AGENT_ID);
  const [tab, setTab] = useState<AnalyticsTab>("overview");
  const [registering, setRegistering] = useState(false);

  const kpi = useMemo(() => computeKpis(agents), [agents]);
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];

  const patch = (id: string, fn: (a: Agent) => Agent) => setAgents((list) => list.map((a) => (a.id === id ? fn(a) : a)));

  const pause = (a: Agent) =>
    modal.confirm({
      title: `Tạm dừng “${a.name}”?`,
      content: "Phiên mới sẽ được chuyển sang trợ lý mặc định; phiên đang chạy vẫn được hoàn tất. Thao tác được ghi nhật ký kiểm toán.",
      okText: "Tạm dừng",
      cancelText: "Hủy",
      onOk: () => {
        patch(a.id, (x) => ({ ...x, status: "paused" }));
        message.success(`Đã tạm dừng ${a.name}.`);
      },
    });

  const resume = (a: Agent) => {
    patch(a.id, (x) => ({ ...x, status: "active" }));
    message.success(`${a.name} đã hoạt động trở lại.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <AiAgentsHeader onRegister={() => setRegistering(true)} />

      <AiKpiCards kpi={kpi} />

      <AiAgentsTable
        agents={agents}
        selectedId={selected?.id ?? ""}
        errorThreshold={kpi.errorThreshold}
        onSelect={setSelectedId}
        onPause={pause}
        onResume={resume}
      />

      {selected && (
        <AiAnalyticsSection
          agent={selected}
          tab={tab}
          onTabChange={setTab}
          onToggleGuard={(g: GuardKey, on) => {
            patch(selected.id, (x) => ({ ...x, guards: { ...x.guards, [g]: on } }));
            if (on) message.success(`Đã bật ${g} cho ${selected.name}.`);
            else message.warning(`Đã tắt ${g} cho ${selected.name}. Nên bật lại sau khi kiểm thử.`);
          }}
          onModelChange={(m) => {
            patch(selected.id, (x) => ({ ...x, model: m }));
            message.success(`${selected.name} chuyển sang ${m} (áp dụng cho phiên mới).`);
          }}
        />
      )}

      <RegisterAgentModal
        open={registering}
        onCancel={() => setRegistering(false)}
        onSubmit={(v) => {
          const id = `ag-${Date.now().toString(36)}`;
          const agent: Agent = {
            id, name: v.name.trim(), description: v.description.trim(), model: v.model, tools: v.tools, status: "pending",
            sessions24h: 0, calls24h: 0, errors24h: 0, p95: 0, ratingsUp: 0, ratingsTotal: 0,
            week: DAYS.map((day) => ({ day, success: 0, errors: 0 })),
            toolStats: v.tools.map((name) => ({ name, calls: 0, errors: 0, p95: 0, scope: v.scopes[0] ?? "" })),
            events: [], sessions: [],
            guards: { "scope-guard": v.guards.includes("scope-guard"), "pii-guard": v.guards.includes("pii-guard"), "prompt-guard": v.guards.includes("prompt-guard") },
            config: { temperature: 0.2, maxTokens: 2048, scopes: v.scopes, retentionDays: 30, systemPrompt: "(chưa cấu hình)" },
          };
          setAgents((list) => [...list, agent]);
          setSelectedId(id);
          setRegistering(false);
          message.success(`Đã gửi đăng ký “${agent.name}” · chờ quản trị viên duyệt.`);
        }}
      />
    </div>
  );
};

export default AiAgentsPage;
