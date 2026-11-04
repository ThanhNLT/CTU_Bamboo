// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { HttpError } from "@refinedev/core";
import { App } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAgents, fetchModels, fetchStats, registerAgent, removeAgent, updateAgent } from "./api";
import { AgentModal } from "./components/AgentModal";
import { AiAgentsHeader } from "./components/AiAgentsHeader";
import { AiAgentsTable } from "./components/AiAgentsTable";
import { AiKpiCards } from "./components/AiKpiCards";
import { AiResourcePanel } from "./components/AiResourcePanel";
import type { Agent, AgentStats, AiModel, LoadedModel } from "./types";
import { STATS_DAYS, totals } from "./utils";
import { tr, trf } from "../../i18n";

type Editing = { agent?: Agent } | undefined;

export const AiAgentsPage = () => {
  const { message, modal } = App.useApp();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<AgentStats[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [loaded, setLoaded] = useState<LoadedModel[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, a, s] = await Promise.all([fetchModels(), fetchAgents(), fetchStats(STATS_DAYS)]);
      setModels(m.models);
      setLoaded(m.loaded ?? []);
      setAiEnabled(m.ai_enabled);
      setAgents(a);
      setStats(s);
    } catch (e) {
      if ((e as HttpError).statusCode === 403) setForbidden(true);
      else message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = useMemo(() => totals(agents, stats), [agents, stats]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setSaving(true);
    try {
      await action();
      message.success(done);
      setEditing(undefined);
      await load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (a: Agent) => {
    if (a.status === "inactive") {
      void run(() => updateAgent(a.id, { status: "active" }), trf("{0} đã hoạt động trở lại.", [a.name]));
      return;
    }
    modal.confirm({
      title: trf("Ngừng “{0}”?", [a.name]),
      content: tr(
        "Người dùng không hỏi được tác tử này nữa; lượt hỏi đang chờ vẫn được trả lời. Thao tác được ghi nhật ký.",
      ),
      okText: tr("Ngừng"),
      cancelText: tr("Hủy"),
      onOk: () => run(() => updateAgent(a.id, { status: "inactive" }), trf("Đã ngừng {0}.", [a.name])),
    });
  };

  const remove = (a: Agent) =>
    modal.confirm({
      title: trf("Xóa “{0}”?", [a.name]),
      content: tr("Tác tử đã có lượt hỏi sẽ chỉ bị ngừng để giữ lịch sử và nhật ký kiểm toán."),
      okText: tr("Xóa"),
      okButtonProps: { danger: true },
      cancelText: tr("Hủy"),
      onOk: async () => {
        try {
          const r = await removeAgent(a.id);
          if (r.deleted) message.success(r.message);
          else message.info(r.message);
          await load();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  if (forbidden)
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
        <AiAgentsHeader onRegister={() => undefined} canRegister={false} />
        <p className="rounded-2xl border border-line bg-surface px-5 py-10 text-center text-[13px] text-muted shadow-card">
          {tr("Bạn cần quyền quản trị tác tử AI (core.ai.manage) để xem trang này.")}
        </p>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <AiAgentsHeader onRegister={() => setEditing({})} canRegister={!loading} />

      {!loading && !aiEnabled && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
          {tr("Ollama không phản hồi (AI bị tắt ở mức RAM 8, hoặc dịch vụ ")}{" "}
          <span className="font-mono">ollama-core</span>{" "}
          {tr("lỗi): vẫn sửa được cấu hình, nhưng người dùng chưa hỏi được và chưa kiểm tra được tên mô hình.")}
        </p>
      )}

      <AiKpiCards kpi={kpi} />

      {!loading && <AiResourcePanel kpi={kpi} loaded={loaded} aiEnabled={aiEnabled} />}

      <AiAgentsTable
        agents={agents}
        stats={stats}
        loading={loading}
        onEdit={(agent) => setEditing({ agent })}
        onToggle={toggle}
        onRemove={remove}
      />

      <AgentModal
        open={editing != null}
        agent={editing?.agent}
        models={models}
        saving={saving}
        onCancel={() => setEditing(undefined)}
        onSubmit={(v) => {
          const agent = editing?.agent;
          if (agent) void run(() => updateAgent(agent.id, v), trf("Đã lưu {0}.", [v.name]));
          else void run(() => registerAgent({ ...v, status: "active" }), trf("Đã đăng ký {0}.", [v.name]));
        }}
      />
    </div>
  );
};

export default AiAgentsPage;
