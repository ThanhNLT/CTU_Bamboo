// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { ToolStep } from "../types";
import { AiAvatar } from "./AiMessage";

/** Trợ lý đang xử lý: lần lượt hiện công cụ đang gọi. */
export const ThinkingMessage = ({ steps }: { steps: ToolStep[] }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (steps.length < 2) return;
    let k = 0;
    const timers = steps.slice(0, -1).map((s) => {
      k += s.ms;
      return window.setTimeout(() => setI((v) => v + 1), k);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [steps]);
  const step = steps[Math.min(i, steps.length - 1)];

  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <AiAvatar />
      <div className="flex items-center gap-2 pt-1 text-[13px] text-muted">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((d) => (
            <span key={d} className="h-1.5 w-1.5 rounded-full bg-bamboo-500 motion-safe:animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
          ))}
        </span>
        {step ? (
          <span>
            Đang chạy <span className="font-mono text-[12px] text-body">{step.name}</span>…
          </span>
        ) : (
          <span>Đang suy nghĩ…</span>
        )}
      </div>
    </div>
  );
};
