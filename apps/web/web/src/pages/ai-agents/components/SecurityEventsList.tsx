// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ShieldAlert, ShieldCheck } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { GuardEvent } from "../types";

export const SecurityEventsList = ({ events, limit }: { events: GuardEvent[]; limit?: number }) => {
  const list = limit ? events.slice(0, limit) : events;
  if (!list.length) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-muted">
        <ShieldCheck className="h-4 w-4 text-bamboo-600" aria-hidden />
        Không có sự kiện rào chắn trong 24 giờ.
      </p>
    );
  }
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {list.map((e) => {
        const blocked = e.action === "blocked";
        return (
          <li key={e.id} className="flex items-start gap-2.5">
            <ShieldAlert
              className={cn("mt-0.5 h-4 w-4 shrink-0", blocked ? "text-red-600" : "text-yellow-600")}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink">{e.title}</span>
              <span className="block text-[11.5px] text-muted">
                {e.at} · {e.source}
              </span>
            </span>
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-medium",
                blocked ? "bg-red-50 text-red-700" : "bg-yellow-50 text-amber-800",
              )}
            >
              {blocked ? "Đã chặn" : "Đã che"}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
