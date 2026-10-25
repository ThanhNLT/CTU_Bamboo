// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Tag } from "antd";

import type { ProcessVersion, SandboxRun } from "../types";

const STATUS = {
  COMPLETED: { color: "green", label: "Đạt – đi tới kết thúc" },
  STOPPED: { color: "orange", label: "Dừng" },
  FAILED: { color: "red", label: "Lỗi" },
} as const;
const AUDIENCE_LABEL = {
  UNIT: "đơn vị và các đơn vị con",
  COMPANY: "toàn công ty",
  GROUP: "toàn tập đoàn (công ty mẹ và công ty con)",
} as const;
const STEP_TYPE: Record<string, string> = {
  startEvent: "Bắt đầu",
  endEvent: "Kết thúc",
  userTask: "Tác vụ",
  serviceTask: "Dịch vụ",
  exclusiveGateway: "Rẽ nhánh",
  parallelGateway: "Song song",
  inclusiveGateway: "Rẽ nhánh",
};

export const RunsTab = ({
  runs,
  versions,
  canDesign,
  onShowRun,
  onRestore,
}: {
  runs: SandboxRun[];
  versions: ProcessVersion[];
  canDesign: boolean;
  onShowRun: (run: SandboxRun) => void;
  onRestore: (version: number) => void;
}) => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-label="Lần chạy thử">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Lần chạy thử</h2>
      {runs.length === 0 && <p className="m-0 mt-2 text-[12.5px] text-muted">Chưa chạy thử lần nào.</p>}
      <ol className="m-0 mt-2 list-none space-y-3 p-0">
        {runs.map((r) => (
          <li key={r.id} className="rounded-xl border border-line/80 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Tag color={STATUS[r.status].color}>{STATUS[r.status].label}</Tag>
              <span className="text-muted">
                {r.startedAt} · {r.startedBy}
                {r.version ? ` · phiên bản v${r.version}` : " · bản nháp"}
                {r.variables?.decision ? ` · quyết định ${String(r.variables.decision)}` : ""}
              </span>
              <button
                type="button"
                className="ml-auto text-[12px] font-semibold text-bamboo-700"
                onClick={() => onShowRun(r)}
              >
                Tô lên sơ đồ
              </button>
            </div>
            {r.variables && (
              <p className="m-0 mt-1 break-words font-mono text-[11.5px] text-muted">
                {Object.entries(r.variables)
                  .filter(([k]) => !["decision", "stepIndex", "stepCount"].includes(k))
                  .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                  .join(" · ")}
              </p>
            )}
            {r.error && <p className="m-0 mt-1.5 break-words text-[12px] text-red-700">{r.error}</p>}
            <ol className="m-0 mt-2 flex list-none flex-wrap items-center gap-1.5 p-0 text-[12px]">
              {r.steps.map((s, i) => (
                <li key={`${s.activity_id}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted">→</span>}
                  <span className="rounded-md bg-canvas px-2 py-0.5 text-ink" title={s.activity_id}>
                    <span className="text-muted">{STEP_TYPE[s.type] ?? s.type}:</span> {s.name}
                    {s.decision ? ` (${s.decision})` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-label="Phiên bản phát hành">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Phiên bản phát hành</h2>
      {versions.length === 0 && <p className="m-0 mt-2 text-[12.5px] text-muted">Chưa phát hành phiên bản nào.</p>}
      <ul className="m-0 mt-2 list-none divide-y divide-line p-0">
        {versions.map((v) => (
          <li key={v.version} className="py-2 text-[12.5px]">
            <span className="font-semibold text-ink">v{v.version}</span>{" "}
            <span className="text-muted">
              · {v.publishedAt} · {v.publishedBy}
            </span>
            {canDesign && (
              <button
                type="button"
                className="ml-2 text-[12px] font-semibold text-bamboo-700"
                onClick={() => onRestore(v.version)}
              >
                Khôi phục về bản nháp
              </button>
            )}
            {v.note && <span className="block text-body">{v.note}</span>}
            {v.audience && <span className="block text-muted">Đối tượng: {AUDIENCE_LABEL[v.audience]}</span>}
            <span className="block font-mono text-[11px] text-muted">SHA-256 {v.sha256.slice(0, 16)}…</span>
          </li>
        ))}
      </ul>
    </section>
  </div>
);
