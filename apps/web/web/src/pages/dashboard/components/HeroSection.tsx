// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useGo } from "@refinedev/core";
import dayjs from "dayjs";
import { Plus, ScanLine } from "lucide-react";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import type { DashboardUser } from "../types";

const greeting = (hour: number) =>
  hour < 11 ? "Chào buổi sáng" : hour < 13 ? "Chào buổi trưa" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";

/** "thứ tư, 07/10/2026" → "Thứ Tư, 07/10/2026" */
const formatToday = (d: dayjs.Dayjs) =>
  d.format("dddd, DD/MM/YYYY").replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase());

export const HeroSection = ({ user, now = dayjs() }: { user: DashboardUser; now?: dayjs.Dayjs }) => {
  const go = useGo();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {greeting(now.hour())}, {user.name}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {user.title} · {user.company} · {formatToday(now)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => go({ to: "/i/ocr" })}
          className={secondaryButtonClass}
        >
          <ScanLine className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden />
          Nhập bằng OCR
        </button>
        <button
          type="button"
          onClick={() => go({ to: { resource: "proc_purchase_request", action: "create" } })}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Tạo hồ sơ
        </button>
      </div>
    </div>
  );
};
