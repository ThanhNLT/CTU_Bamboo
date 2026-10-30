// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { CheckCircle2, ClipboardCheck, Sparkles } from "lucide-react";

import { Dot, primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { EntityStatus, Incident, TwinEntity } from "../types";
import { ENTITY_STATUS } from "../utils";

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
            "mt-2.5 inline-flex h-6 items-center gap-1.5 rounded-ui px-2.5 text-[12px] font-medium",
            TAG_CLASS[entity.status],
          )}
        >
          <Dot tone={status.tone} />
          {status.label} · {entity.grade}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button type="button" onClick={onAsk} className={secondaryButtonClass}>
          <Sparkles className="h-4 w-4 text-bamboo-600" aria-hidden />
          Hỏi trợ lý
        </button>
        {pending ? (
          <button type="button" onClick={() => onAcknowledge(pending)} className={primaryButtonClass}>
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            Ghi nhận sự cố {pending.code}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
            <CheckCircle2 className="h-4 w-4 text-bamboo-600" aria-hidden />
            Không có sự cố chờ ghi nhận
          </span>
        )}
      </div>
    </header>
  );
};
