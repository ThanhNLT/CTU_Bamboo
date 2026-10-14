// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { formatClock } from "../utils";

const LiveBadge = ({ updatedAt }: { updatedAt: number }) => (
  <span className="inline-flex h-8 shrink-0 items-center gap-2 self-start rounded-full bg-black/[0.045] px-3 text-[12.5px] text-body sm:self-auto">
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-bamboo-500 opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-bamboo-500" />
    </span>
    <span>
      Số đo mới nhất{" "}
      <time className="tabular-nums" dateTime={new Date(updatedAt).toISOString()}>
        {formatClock(updatedAt)}
      </time>
    </span>
  </span>
);

export const TwinPageHeader = ({ updatedAt }: { updatedAt: number }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Bản sao số</h1>
      <p className="mt-1 text-[13px] text-muted">
        Dữ liệu cảm biến theo chuẩn NGSI-LD · hội tụ IT/OT · tự làm mới mỗi phút
      </p>
    </div>
    <LiveBadge updatedAt={updatedAt} />
  </div>
);
