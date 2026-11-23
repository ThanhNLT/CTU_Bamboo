/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AlertTriangle, Copy, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import { citationLabel, citationLink, elapsed, refusalText } from "../assistant";
import type { Question } from "../types";
import { RichText } from "./RichText";
import { ThinkingMessage } from "./ThinkingMessage";
import { tr, trf } from "../../../i18n";

export const AiAvatar = () => (
  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-ui bg-bamboo-50 text-bamboo-600" aria-hidden>
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

export const AiMessage = ({ q, onCopy, onRetry }: { q: Question; onCopy: () => void; onRetry: () => void }) => {
  if (q.status === "queued")
    return (
      <ThinkingMessage
        label={q.position ? trf("Đang chờ, vị trí thứ {0}…", [q.position + 1]) : tr("Đang chờ trợ lý…")}
      />
    );
  if (q.status === "running" && !q.answer)
    return (
      <ThinkingMessage
        label={q.first_token_at ? tr("Đang soạn câu trả lời…") : tr("Đang tìm trong Thư viện tri thức…")}
      />
    );

  return (
    <div className="flex gap-3">
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-3" aria-busy={q.status === "running"}>
        {q.status === "refused" ? (
          <Notice tone="warn" icon={<ShieldAlert className="h-4 w-4" />}>
            {refusalText(q)}
          </Notice>
        ) : q.status === "error" ? (
          <Notice tone="error" icon={<AlertTriangle className="h-4 w-4" />}>
            <p>{q.error ?? tr("Trợ lý AI tạm thời không trả lời được.")}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-red-800 underline-offset-2 hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {tr("Hỏi lại")}
            </button>
          </Notice>
        ) : q.answer ? (
          <RichText text={q.answer} citations={q.citations} />
        ) : null}
        {q.status === "done" && q.citations.length > 0 && (
          <div className="flex flex-col gap-1 text-[12px]">
            <span className="text-muted">{tr("Nguồn:")}</span>
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {q.citations.map((c) => (
                <li key={c.n} className="min-w-0">
                  <Link
                    to={citationLink(c)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-black/[0.045] px-2 py-0.5 text-[12px] text-ink transition-colors hover:bg-bamboo-50 hover:text-bamboo-800"
                  >
                    <span className="shrink-0 font-semibold tabular-nums text-bamboo-700">{c.n}</span>
                    <span className="truncate">{citationLabel(c)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
        {q.status === "done" && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onCopy} aria-label={tr("Sao chép câu trả lời")} className={iconBtn}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="ml-1.5 text-[11.5px] text-muted">
              {tr("Do AI tạo · hãy kiểm tra trước khi dùng")}
              {q.reused_from ? ` · ${tr("dùng lại câu trả lời đã có cho cùng câu hỏi và tài liệu")}` : ""}
              {elapsed(q) ? ` · ${elapsed(q)}` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
