/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { formatClock } from "../utils";
import { tr } from "../../../i18n";

const LiveBadge = ({ updatedAt }: { updatedAt: number }) => (
  <span className="inline-flex h-8 shrink-0 items-center gap-2 self-start rounded-full bg-black/[0.045] px-3 text-[12.5px] text-body sm:self-auto">
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-ui bg-bamboo-500 opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-ui bg-bamboo-500" />
    </span>
    <span>
      {tr("Số đo mới nhất")}{" "}
      <time className="tabular-nums" dateTime={new Date(updatedAt).toISOString()}>
        {formatClock(updatedAt)}
      </time>
    </span>
  </span>
);

export const TwinPageHeader = ({ updatedAt, live }: { updatedAt: number; live?: boolean }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Bản sao số")}</h1>
      <p className="mt-1 text-[13px] text-muted">
        {live
          ? tr("Dữ liệu cảm biến theo chuẩn NGSI-LD · hội tụ IT/OT · cập nhật ngay khi có số đo mới")
          : tr("Dữ liệu cảm biến theo chuẩn NGSI-LD · hội tụ IT/OT · tự làm mới mỗi phút")}
      </p>
    </div>
    <LiveBadge updatedAt={updatedAt} />
  </div>
);
