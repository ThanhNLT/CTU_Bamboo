// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Check, LoaderCircle } from "lucide-react";
import { Fragment } from "react";
import { cn } from "../../../utils/cn";
import type { Step } from "../types";

const Marker = ({ step, index }: { step: Step; index: number }) => {
  if (step.state === "done") {
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bamboo-600 text-white" aria-hidden>
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
    );
  }
  if (step.state === "running") {
    return (
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-bamboo-500 text-bamboo-600"
        aria-hidden
      >
        <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[12px] font-semibold",
        step.state === "active" ? "border-bamboo-600 text-bamboo-700" : "border-line text-muted",
      )}
      aria-hidden
    >
      {index + 1}
    </span>
  );
};

const STATE_LABEL = { done: "đã xong", active: "đang thực hiện", running: "đang chạy", pending: "chưa tới" } as const;

/** Thanh tiến trình 4 bước. Đoạn nối có màu xanh khi bước bên trái đã xong. */
export const OcrStepper = ({ steps }: { steps: Step[] }) => (
  <ol
    aria-label="Tiến trình nhập liệu"
    className="m-0 flex list-none flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-center sm:gap-0 sm:px-5"
  >
    {steps.map((s, i) => (
      <Fragment key={s.key}>
        <li
          className="flex min-w-0 items-center gap-2.5 sm:shrink-0"
          aria-current={s.state === "active" ? "step" : undefined}
        >
          <Marker step={s} index={i} />
          <span className="min-w-0">
            <span
              className={cn(
                "block text-[13px] font-semibold",
                s.state === "pending" ? "text-muted" : s.state === "active" ? "text-bamboo-700" : "text-ink",
              )}
            >
              {s.title}
              <span className="sr-only"> ({STATE_LABEL[s.state]})</span>
            </span>
            <span className="block truncate text-[11.5px] text-muted sm:max-w-[180px]">{s.sub}</span>
          </span>
        </li>
        {i < steps.length - 1 && (
          <li
            aria-hidden
            className={cn(
              "mx-4 hidden h-0.5 min-w-6 flex-1 rounded-full sm:block",
              s.state === "done" ? "bg-bamboo-500" : "bg-line",
            )}
          />
        )}
      </Fragment>
    ))}
  </ol>
);
