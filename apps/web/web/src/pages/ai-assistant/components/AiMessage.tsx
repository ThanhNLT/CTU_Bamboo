// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ChevronRight, Copy, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { cn } from "../../../utils/cn";
import { formatSeconds } from "../assistant";
import type { AiMsg, ToolStep } from "../types";
import { AiActionCard } from "./AiActionCard";
import { AiChartWidget } from "./AiChartWidget";
import { RichText } from "./RichText";

export const AiAvatar = () => (
  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bamboo-50 text-bamboo-600" aria-hidden>
    <Sparkles className="h-4 w-4" />
  </span>
);

/** "Các bước đã làm": các công cụ trợ lý đã gọi, mở ra để xem tham số và thời gian. */
const StepsAccordion = ({ steps }: { steps: ToolStep[] }) => {
  const [open, setOpen] = useState(false);
  const total = steps.reduce((a, s) => a + s.ms, 0);
  return (
    <div className="rounded-xl bg-black/[0.035]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-ink">Các bước đã làm ({steps.length})</span>
          <span className="font-mono text-[11.5px] text-muted"> · {steps.map((s) => s.name).join(" · ")}</span>
        </span>
        <span className="shrink-0 tabular-nums text-muted">{formatSeconds(total)}</span>
      </button>
      {open && (
        <ol className="m-0 list-none space-y-1.5 px-3 pb-3 pl-8">
          {steps.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="min-w-0 break-words font-mono text-[11.5px] text-ink">
                {i + 1}. {s.name}(<span className="text-muted">{s.args}</span>)
              </span>
              <span className="shrink-0 tabular-nums text-muted">{formatSeconds(s.ms)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const idle = "text-muted hover:text-ink";
const iconBtn =
  "grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-black/[0.05] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";

/** Câu trả lời của trợ lý: văn bản có trích nguồn, biểu đồ, các bước, nguồn, đề xuất tác vụ, phản hồi. */
export const AiMessage = ({
  msg,
  feedback,
  createdCode,
  onFeedback,
  onCopy,
  onEditDraft,
  onConfirmDraft,
}: {
  msg: AiMsg;
  feedback?: "up" | "down";
  createdCode?: string;
  onFeedback: (f: "up" | "down") => void;
  onCopy: () => void;
  onEditDraft: () => void;
  onConfirmDraft: () => void;
}) => (
  <div className="flex gap-3">
    <AiAvatar />
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <RichText text={msg.text} sources={msg.sources} />
      {msg.chart && <AiChartWidget spec={msg.chart} />}
      {msg.steps?.length ? <StepsAccordion steps={msg.steps} /> : null}
      {msg.sources?.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="mr-1 text-muted">Nguồn:</span>
          {msg.sources.map((s) => (
            <Link
              key={s.id}
              to={s.to}
              className="inline-flex h-6 items-center rounded-md bg-black/[0.045] px-2 text-[11.5px] font-medium text-ink transition-colors hover:bg-bamboo-50 hover:text-bamboo-800"
            >
              [{s.id}] {s.label}
            </Link>
          ))}
        </div>
      ) : null}
      {msg.action && (
        <AiActionCard action={msg.action} createdCode={createdCode} onEdit={onEditDraft} onConfirm={onConfirmDraft} />
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onFeedback("up")}
          aria-pressed={feedback === "up"}
          aria-label="Câu trả lời hữu ích"
          className={cn(iconBtn, feedback === "up" ? "text-bamboo-700" : idle)}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onFeedback("down")}
          aria-pressed={feedback === "down"}
          aria-label="Câu trả lời chưa tốt"
          className={cn(iconBtn, feedback === "down" ? "text-red-600" : idle)}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" onClick={onCopy} aria-label="Sao chép câu trả lời" className={cn(iconBtn, idle)}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="ml-1.5 text-[11.5px] text-muted">Do AI tạo · hãy kiểm tra trước khi dùng</span>
      </div>
    </div>
  </div>
);
