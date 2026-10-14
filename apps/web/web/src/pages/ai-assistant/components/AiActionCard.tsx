// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Check, CheckCircle2, Sparkles } from "lucide-react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { ActionProposal } from "../types";

const outline =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-black/[0.05] px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-black/[0.08] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";
const primary =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-bamboo-600 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-bamboo-700 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";

export const AiActionCard = ({
  action,
  createdCode,
  onEdit,
  onConfirm,
}: {
  action: ActionProposal;
  createdCode?: string;
  onEdit: () => void;
  onConfirm: () => void;
}) => (
  <section
    aria-label={action.title}
    className={cn("rounded-2xl border-[1.5px] bg-white p-4", createdCode ? "border-bamboo-300" : "border-bamboo-600")}
  >
    <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
      <Sparkles className="h-4 w-4 text-bamboo-600" aria-hidden />
      {action.title}
    </h3>
    <dl className="m-0 mt-2.5 space-y-1.5">
      {[
        ["Loại hồ sơ", action.recordType],
        ["Thiết bị", action.device],
        ["Mô tả", action.description],
      ].map(([k, v]) => (
        <div key={k} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
          <dt className="text-[12px] text-muted">{k}</dt>
          <dd className="m-0 text-[12.5px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>

    {createdCode ? (
      <p
        className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-bamboo-50 px-3 py-2 text-[12.5px] text-bamboo-800"
        role="status"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Đã tạo hồ sơ nháp <b className="font-mono font-semibold">{createdCode}</b>
        <Link to="/p/records" className="ml-auto font-semibold underline-offset-2 hover:underline">
          Mở hồ sơ
        </Link>
      </p>
    ) : (
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={outline}>
          Mở biểu mẫu để sửa
        </button>
        <button type="button" onClick={onConfirm} className={primary}>
          <Check className="h-4 w-4" aria-hidden />
          Xác nhận tạo nháp
        </button>
      </div>
    )}
    <p className="mt-2 text-[11.5px] text-muted">{action.note}</p>
  </section>
);
