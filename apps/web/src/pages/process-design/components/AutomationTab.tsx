/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { Input, Modal, Select, Tag } from "antd";
import { useState } from "react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import type { AutomationOverview, AutomationRun } from "../types";
import { tr, trf } from "../../../i18n";

const RUN_STATUS = {
  RUNNING: { color: "processing", label: tr("Đang chạy") },
  COMPLETED: { color: "green", label: tr("Hoàn tất") },
  FAILED: { color: "red", label: tr("Lỗi") },
  CANCELLED: { color: "default", label: tr("Đã hủy") },
} as const;

const TRIGGER_LABEL = { MANUAL: "", TIMER: tr("Hẹn giờ"), WEBHOOK: "Webhook", EVENT: tr("Sự kiện nghiệp vụ") } as const;

const parseVariables = (text: string): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {};
  for (const line of text.split("\n")) {
    const row = line.trim();
    if (!row) continue;
    const at = row.indexOf("=");
    if (at < 1) throw new Error(trf("Dòng “{0}” cần dạng tên=giá trị", [row]));
    const raw = row.slice(at + 1).trim();
    out[row.slice(0, at).trim()] =
      raw === "true" || raw === "false"
        ? raw === "true"
        : raw !== "" && Number.isFinite(Number(raw))
          ? Number(raw)
          : raw;
  }
  return out;
};

const RunRow = ({ run }: { run: AutomationRun }) => (
  <li className="rounded-xl border border-line/80 p-3 text-[12.5px]">
    <div className="flex flex-wrap items-center gap-2">
      <Tag color={RUN_STATUS[run.status].color}>{RUN_STATUS[run.status].label}</Tag>
      <span className="text-muted">
        {run.trigger === "MANUAL" ? trf("Khởi chạy bởi {0}", [run.startedBy]) : TRIGGER_LABEL[run.trigger]} ·{" "}
        {run.startedAt}
        {run.endedAt ? ` → ${run.endedAt}` : ""} {tr(" · đã báo ")} {run.notified} {tr(" người")}
      </span>
    </div>
    {run.error && <p className="m-0 mt-1.5 break-words text-red-700">{run.error}</p>}
    {run.steps.length > 0 && (
      <p className="m-0 mt-1.5 text-body">
        {run.steps
          .filter((s) => s.type !== "sequenceFlow")
          .map((s) => s.name)
          .join(" → ")}
      </p>
    )}
  </li>
);

export const AutomationTab = ({
  automation,
  hasPublished,
  canManage,
  onEnable,
  onDisable,
  onStart,
  onEvents,
  onWebhook,
}: {
  automation: AutomationOverview | null;
  hasPublished: boolean;
  canManage: boolean;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
  onStart: (variables: Record<string, string | number | boolean>) => Promise<void>;
  onEvents: (events: string[]) => Promise<void>;
  onWebhook: () => Promise<string>;
}) => {
  const [hook, setHook] = useState<string>();
  const [starting, setStarting] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = automation?.status === "ACTIVE";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
    } finally {
      setBusy(false);
    }
  };

  const submitStart = async () => {
    try {
      const variables = parseVariables(starting ?? "");
      setError(undefined);
      await run(() => onStart(variables));
      setStarting(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-label={tr("Chạy tự động")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[14px] font-semibold text-ink">{tr("Chạy tự động")}</h2>
          <p className="m-0 mt-1 text-[12.5px] text-body">
            {active
              ? trf(
                  "Đang bật cho phiên bản v{0} ({1}, {2}). Hệ thống tự thực hiện {3} tác vụ tự động và tự bắt đầu theo hẹn giờ nếu sơ đồ có.",
                  [automation?.version, automation?.activatedBy, automation?.activatedAt, automation?.actions],
                )
              : tr(
                  "Chưa bật. Khi bật, hệ thống tự thực hiện các tác vụ tự động (như gửi thông báo) và bắt đầu theo hẹn giờ trên bản đã phát hành, không cần người thao tác. Quy trình chỉ gồm sự kiện, cổng rẽ nhánh, hẹn giờ và tác vụ tự động.",
                )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && canManage && (
            <button type="button" className={primaryButtonClass} onClick={() => setStarting("")} disabled={busy}>
              {tr("Khởi chạy ngay")}
            </button>
          )}
          {canManage && !active && (
            <button
              type="button"
              className={primaryButtonClass}
              disabled={busy || !hasPublished}
              title={hasPublished ? undefined : tr("Cần phát hành quy trình trước")}
              onClick={() => void run(onEnable)}
            >
              {tr("Bật chạy tự động")}
            </button>
          )}
          {canManage && active && (
            <>
              <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void run(onEnable)}>
                {tr("Áp dụng phiên bản mới nhất")}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => void run(onDisable)}
              >
                {tr("Tắt")}
              </button>
            </>
          )}
        </div>
      </div>

      {active && (
        <div className="mt-4 grid gap-3 border-t border-line/80 pt-3 md:grid-cols-2">
          <div>
            <h3 className="m-0 text-[13px] font-semibold text-ink">{tr("Tự khởi chạy khi có sự kiện")}</h3>
            <Select
              mode="multiple"
              aria-label={tr("Sự kiện khởi chạy")}
              className="mt-1.5 w-full"
              disabled={!canManage || busy}
              placeholder={tr("Không đăng ký sự kiện nào")}
              value={automation?.events ?? []}
              options={(automation?.eventCatalog ?? []).map((e) => ({ value: e.code, label: tr(e.label) }))}
              onChange={(v: string[]) => void run(() => onEvents(v))}
            />
          </div>
          <div>
            <h3 className="m-0 text-[13px] font-semibold text-ink">{tr("Webhook cho hệ thống ngoài")}</h3>
            <p className="m-0 mt-1 text-[12px] text-muted">
              {automation?.webhook
                ? tr("Đã có webhook. Đổi mã sẽ vô hiệu mã cũ.")
                : tr(
                    "Chưa có. Hệ thống ngoài gọi POST tới đường dẫn bí mật để khởi chạy; thân JSON thành biến quy trình.",
                  )}
            </p>
            {canManage && (
              <button
                type="button"
                className={`${secondaryButtonClass} mt-1.5`}
                disabled={busy}
                onClick={() => void run(async () => setHook(await onWebhook()))}
              >
                {automation?.webhook ? tr("Đổi mã webhook") : tr("Tạo webhook")}
              </button>
            )}
            {hook && (
              <p className="m-0 mt-1.5 break-all rounded-lg bg-surface p-2 font-mono text-[12px]">
                {`${window.location.origin}${hook}`}
                <span className="mt-1 block font-sans text-[11.5px] text-red-700">
                  {tr("Chỉ hiện một lần; hãy sao chép ngay.")}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      <h3 className="m-0 mt-4 text-[13px] font-semibold text-ink">{tr("Các lần chạy gần đây")}</h3>
      {(automation?.runs.length ?? 0) === 0 && (
        <p className="m-0 mt-2 text-[12.5px] text-muted">{tr("Chưa có lần chạy nào.")}</p>
      )}
      <ul className="m-0 mt-2 list-none space-y-2 p-0">
        {automation?.runs.map((r) => (
          <RunRow key={r.id} run={r} />
        ))}
      </ul>

      <Modal
        open={starting !== undefined}
        title={tr("Khởi chạy quy trình tự động")}
        okText={tr("Khởi chạy")}
        cancelText={tr("Hủy")}
        okButtonProps={{ loading: busy }}
        onOk={() => void submitStart()}
        onCancel={() => setStarting(undefined)}
        destroyOnHidden
      >
        <p className="mt-0 text-[12.5px] text-body">
          {tr(
            "Hệ thống chạy ngay trên phiên bản đang bật. Có thể truyền biến đầu vào để các cổng rẽ nhánh chọn đường, mỗi dòng một biến dạng ",
          )}{" "}
          <span className="font-mono">{tr("tên=giá trị")}</span>.
        </p>
        <Input.TextArea
          aria-label={tr("Biến đầu vào")}
          autoSize={{ minRows: 3 }}
          className="font-mono"
          placeholder={"amount=9\nloai=khan"}
          value={starting ?? ""}
          onChange={(e) => setStarting(e.target.value)}
        />
        {error && <p className="mb-0 mt-2 text-[12px] text-red-700">{error}</p>}
      </Modal>
    </section>
  );
};
