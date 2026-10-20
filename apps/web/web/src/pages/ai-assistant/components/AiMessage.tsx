// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { AlertTriangle, Brain, ChevronDown, ChevronRight, Copy, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import { citationLabel, citationLink, elapsed, refusalText } from "../assistant";
import type { Question } from "../types";
import { RichText } from "./RichText";
import { ThinkingMessage } from "./ThinkingMessage";

export const AiAvatar = () => (
  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bamboo-50 text-bamboo-600" aria-hidden>
    <Sparkles className="h-4 w-4" />
  </span>
);

const iconBtn =
  "grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-black/[0.05] hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";

const Notice = ({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      "flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed",
      tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800",
    )}
  >
    <span className="mt-0.5 shrink-0" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export const ThinkingAccordion = ({
  thinking,
  isLive,
  elapsedSec,
}: {
  thinking: string;
  isLive: boolean;
  elapsedSec?: string | null;
}) => {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isOpen = userToggled !== null ? userToggled : isLive;

  return (
    <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] text-[13px] transition-colors">
      <button
        type="button"
        onClick={() => setUserToggled(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-muted hover:text-ink"
      >
        <span className="inline-flex items-center gap-2">
          {isLive ? (
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-bamboo-500 motion-safe:animate-bounce"
                  style={{ animationDelay: `${d * 120}ms` }}
                />
              ))}
            </span>
          ) : (
            <Brain className="h-3.5 w-3.5 text-bamboo-600" aria-hidden />
          )}
          <span>{isLive ? "Đang suy luận…" : elapsedSec ? `Đã suy nghĩ trong ${elapsedSec}` : "Dòng suy nghĩ"}</span>
        </span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-black/[0.06] px-3 py-2.5 text-muted whitespace-pre-wrap break-words text-[12.5px] leading-relaxed">
          {thinking}
        </div>
      )}
    </div>
  );
};

export const AiMessage = ({ q, onCopy, onRetry }: { q: Question; onCopy: () => void; onRetry: () => void }) => {
  if (q.status === "queued" && q.gpu_wait_since) return <ThinkingMessage label="Đang chờ GPU…" />;
  if (q.status === "queued")
    return <ThinkingMessage label={q.position ? `Đang chờ, vị trí thứ ${q.position + 1}…` : "Đang chờ trợ lý…"} />;
  if (q.status === "running" && !q.answer && !q.thinking)
    return <ThinkingMessage label="Đang tìm trong Thư viện tri thức…" />;

  const isLiveThinking = q.status === "running" && !q.answer;

  return (
    <div className="flex gap-3">
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-3" aria-busy={q.status === "running"}>
        {q.thinking && <ThinkingAccordion thinking={q.thinking} isLive={isLiveThinking} elapsedSec={elapsed(q)} />}
        {q.status === "refused" ? (
          <Notice tone="warn" icon={<ShieldAlert className="h-4 w-4" />}>
            {refusalText(q)}
          </Notice>
        ) : q.status === "error" ? (
          <Notice tone="error" icon={<AlertTriangle className="h-4 w-4" />}>
            <p>{q.error ?? "Trợ lý AI tạm thời không trả lời được."}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-red-800 underline-offset-2 hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Hỏi lại
            </button>
          </Notice>
        ) : q.answer ? (
          <RichText text={q.answer} citations={q.citations} />
        ) : null}
        {q.status === "done" && q.citations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="mr-1 text-muted">Nguồn:</span>
            {q.citations.map((c) => (
              <Link
                key={c.n}
                to={citationLink(c)}
                className="inline-flex h-6 max-w-full items-center truncate rounded-md bg-black/[0.045] px-2 text-[11.5px] font-medium text-ink transition-colors hover:bg-bamboo-50 hover:text-bamboo-800"
              >
                [{c.n}] {citationLabel(c)}
              </Link>
            ))}
          </div>
        )}
        {q.status === "done" && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onCopy} aria-label="Sao chép câu trả lời" className={iconBtn}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="ml-1.5 text-[11.5px] text-muted">
              Do AI tạo · hãy kiểm tra trước khi dùng
              {elapsed(q) ? ` · ${elapsed(q)}` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
