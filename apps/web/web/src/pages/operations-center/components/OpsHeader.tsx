// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Monitor, MonitorOff } from "lucide-react";
import { secondaryButtonClass } from "../../../components/ui";

export const OpsHeader = ({ presenting, onTogglePresent }: { presenting: boolean; onTogglePresent: () => void }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Trung tâm điều hành</h1>
      <p className="mt-1 text-[13px] text-muted">
        Tập đoàn đang vận hành thế nào hôm nay? · trong phạm vi bạn được xem
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-2.5">
      <button type="button" onClick={onTogglePresent} className={secondaryButtonClass} aria-pressed={presenting}>
        {presenting ? <MonitorOff className="h-4 w-4" aria-hidden /> : <Monitor className="h-4 w-4" aria-hidden />}
        {presenting ? "Thoát trình chiếu" : "Trình chiếu"}
      </button>
    </div>
  </div>
);
