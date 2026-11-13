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

import { App, InputNumber, Modal } from "antd";
import { useState } from "react";

import { cn } from "../../../utils/cn";
import { adminSave } from "../../admin/shared/api";
import { usePermissions } from "../../admin/shared/usePermissions";
import type { StorageSegment } from "../types";
import type { DriveUsage } from "../useDriveUsage";
import { formatBytes } from "../utils";
import { tr } from "../../../i18n";

const GB = 1024 ** 3;

export const StorageCard = ({
  segments,
  usage,
  onChanged,
}: {
  segments: StorageSegment[];
  usage?: DriveUsage;
  onChanged: () => void;
}) => {
  const { message } = App.useApp();
  const perms = usePermissions();
  const [editing, setEditing] = useState(false);
  const [gb, setGb] = useState<number | null>(null);
  const visible = segments.reduce((sum, s) => sum + s.bytes, 0);
  const total = usage ? Math.max(usage.quotaBytes, 1) : Math.max(visible, 1);
  const percent = usage ? Math.min(100, (usage.usedBytes / total) * 100) : 0;

  const save = async () => {
    try {
      await adminSave("storage_quota", { quota_gb: gb });
      message.success(tr("Đã đổi hạn mức dung lượng."));
      setEditing(false);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-labelledby="storage-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="storage-title" className="text-[14px] font-semibold text-ink">
          {tr("Dung lượng")}
        </h2>
        {usage && (
          <span className="text-[12px] tabular-nums text-muted">
            {formatBytes(usage.usedBytes)} / {formatBytes(usage.quotaBytes)}
          </span>
        )}
      </div>

      {usage && (
        <>
          <div
            className="mt-3 h-2 overflow-hidden rounded-ui bg-gray-200/70"
            role="progressbar"
            aria-label={tr("Dung lượng đã dùng")}
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className={cn("block h-full", percent >= 90 ? "bg-red-500" : "bg-bamboo-600")}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-body">
            {tr("Còn khả dụng ")} <b className="tabular-nums">{formatBytes(usage.availableBytes)}</b> (
            {(100 - percent).toFixed(0)}
            {tr("%) cho cả đơn vị")}
          </p>
        </>
      )}

      <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[12px]">
            <span className={cn("h-2 w-2 shrink-0 rounded-ui", s.className)} aria-hidden />
            <span className="flex-1 text-body">{s.label}</span>
            <span className="tabular-nums text-muted">{formatBytes(s.bytes)}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-[11.5px] text-muted">
        {tr("Theo loại: tệp bạn xem được (")}
        {formatBytes(visible)}).
      </p>

      {usage && perms?.has("core.org.manage") && (
        <button
          type="button"
          className="mt-2 text-[12px] font-semibold text-bamboo-700 underline-offset-2 hover:underline"
          onClick={() => {
            setGb(Math.round((usage.quotaBytes / GB) * 10) / 10);
            setEditing(true);
          }}
        >
          {tr("Đổi hạn mức")}
        </button>
      )}
      <Modal
        open={editing}
        title={tr("Hạn mức dung lượng của đơn vị")}
        okText={tr("Lưu")}
        cancelText={tr("Hủy")}
        onOk={() => void save()}
        onCancel={() => setEditing(false)}
        destroyOnHidden
      >
        <p className="text-[13px] text-body">
          {tr("Tổng dung lượng tệp đính kèm của cả tenant. Vượt hạn mức thì không tải thêm tệp được.")}
        </p>
        <InputNumber
          aria-label={tr("Hạn mức (GB)")}
          min={0.1}
          max={100000}
          step={1}
          value={gb}
          onChange={setGb}
          addonAfter="GB"
          className="w-full"
        />
      </Modal>
    </section>
  );
};
