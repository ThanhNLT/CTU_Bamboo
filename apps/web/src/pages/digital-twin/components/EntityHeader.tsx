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

import { CheckCircle2, ClipboardCheck, Sparkles } from "lucide-react";

import { Dot, primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { EntityStatus, Incident, TwinEntity } from "../types";
import { ENTITY_STATUS } from "../utils";
import { tr } from "../../../i18n";

const TAG_CLASS: Record<EntityStatus, string> = {
  critical: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  ok: "bg-bamboo-50 text-bamboo-800",
  offline: "bg-gray-100 text-gray-600",
};

export const EntityHeader = ({
  entity,
  pending,
  onAsk,
  onAcknowledge,
}: {
  entity: TwinEntity;
  pending?: Incident;
  onAsk: () => void;
  onAcknowledge: (i: Incident) => void;
}) => {
  const status = ENTITY_STATUS[entity.status];
  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="break-all font-mono text-[11.5px] text-muted">
          {entity.type} · {entity.urn}
        </div>
        <h2 className="mt-1 text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          {entity.name} · {entity.site}
        </h2>
        <span
          className={cn(
            "mt-2.5 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
            TAG_CLASS[entity.status],
          )}
        >
          <Dot tone={status.tone} />
          {status.label} · {entity.grade}
        </span>
        <span
          className={cn(
            "ml-2 mt-2.5 inline-flex h-6 items-center rounded-full px-2.5 text-[12px]",
            entity.liveSource ? "bg-sky-50 text-sky-800" : "bg-black/[0.045] text-muted",
          )}
          title={
            entity.liveSource
              ? tr("Số đo nhận trực tiếp từ thiết bị (NGSI-LD)")
              : tr("Chưa có số đo trực tiếp: đang hiện dữ liệu mẫu")
          }
        >
          {entity.liveSource === "mqtt"
            ? tr("Trực tiếp · MQTT")
            : entity.liveSource === "api"
              ? tr("Trực tiếp · API")
              : tr("Dữ liệu mẫu")}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button type="button" onClick={onAsk} className={secondaryButtonClass}>
          <Sparkles className="h-4 w-4 text-bamboo-600" aria-hidden />
          {tr("Hỏi trợ lý")}
        </button>
        {pending ? (
          <button type="button" onClick={() => onAcknowledge(pending)} className={primaryButtonClass}>
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            {tr("Ghi nhận sự cố ")} {pending.code}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
            <CheckCircle2 className="h-4 w-4 text-bamboo-600" aria-hidden />
            {tr("Không có sự cố chờ ghi nhận")}
          </span>
        )}
      </div>
    </header>
  );
};
