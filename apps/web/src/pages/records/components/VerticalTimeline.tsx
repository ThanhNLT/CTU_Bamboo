import { Check, CornerUpLeft } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { StepState, WorkflowStep } from "../types";
import { tr } from "../../../i18n";

const STATE_TEXT: Record<StepState, string> = {
  done: tr("đã xong"),
  current: tr("đang xử lý"),
  returned: tr("trả lại"),
  pending: tr("chưa tới"),
};

const Marker = ({ state }: { state: StepState }) => {
  if (state === "done") {
    return (
      <span className="grid h-[18px] w-[18px] place-items-center rounded-ui bg-bamboo-600 text-white">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "returned") {
    return (
      <span className="grid h-[18px] w-[18px] place-items-center rounded-ui bg-red-500 text-white">
        <CornerUpLeft className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "block h-[18px] w-[18px] rounded-ui border-2 bg-surface",
        state === "current" ? "border-bamboo-600 shadow-[0_0_0_3px_var(--color-bamboo-100)]" : "border-gray-300",
      )}
    />
  );
};

export const VerticalTimeline = ({ steps }: { steps: WorkflowStep[] }) => (
  <ol className="m-0 list-none p-0">
    {steps.map((s, i) => {
      const last = i === steps.length - 1;
      return (
        <li key={s.key} className="relative flex gap-2.5 pb-3 last:pb-0">
          {!last && (
            <span
              aria-hidden
              className={cn(
                "absolute left-[8.5px] top-[20px] bottom-0 w-px",
                s.state === "done" ? "bg-bamboo-300" : "bg-gray-200",
              )}
            />
          )}
          <span className="relative z-[1] mt-px shrink-0">
            <Marker state={s.state} />
          </span>
          <div className="min-w-0 pb-0.5">
            <div
              className={cn(
                "text-[13px] leading-[19px]",
                s.state === "current" && "font-semibold text-bamboo-700",
                s.state === "done" && "font-medium text-ink",
                s.state === "returned" && "font-semibold text-red-700",
                s.state === "pending" && "text-muted",
              )}
            >
              {s.label}
              <span className="sr-only"> ({STATE_TEXT[s.state]})</span>
            </div>
            {s.meta && <div className="mt-0.5 truncate text-[11.5px] text-muted">{s.meta}</div>}
          </div>
        </li>
      );
    })}
  </ol>
);
