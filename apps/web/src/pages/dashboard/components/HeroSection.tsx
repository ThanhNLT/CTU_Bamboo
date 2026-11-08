import { useGo } from "@refinedev/core";
import dayjs from "dayjs";
import { Plus, ScanLine } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import type { DashboardUser } from "../types";
import { tr } from "../../../i18n";

const greeting = (hour: number) =>
  hour < 11
    ? tr("Chào buổi sáng")
    : hour < 13
      ? tr("Chào buổi trưa")
      : hour < 18
        ? tr("Chào buổi chiều")
        : tr("Chào buổi tối");

const formatToday = (d: dayjs.Dayjs) =>
  d.format("dddd, DD/MM/YYYY").replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase());

const Chip = ({ children }: { children: string }) => (
  <span className="inline-flex items-center rounded-full border border-[var(--glass-card-edge)] bg-[var(--glass-card)] px-3 py-1 text-[12.5px] text-body backdrop-blur-xl">
    {children}
  </span>
);

export const HeroSection = ({ user, now = dayjs() }: { user: DashboardUser; now?: dayjs.Dayjs }) => {
  const go = useGo();
  return (
    <div className="flex flex-col gap-5 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-3">
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[36px]">
          {greeting(now.hour())},<br className="sm:hidden" /> {user.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {user.title && <Chip>{user.title}</Chip>}
          {user.company && <Chip>{user.company}</Chip>}
          <Chip>{formatToday(now)}</Chip>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => go({ to: "/i/ocr" })} className={secondaryButtonClass}>
          <ScanLine className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden />
          {tr("Nhập bằng OCR")}
        </button>
        <button
          type="button"
          onClick={() => go({ to: { resource: "proc_purchase_request", action: "create" } })}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          {tr("Tạo hồ sơ")}
        </button>
      </div>
    </div>
  );
};
