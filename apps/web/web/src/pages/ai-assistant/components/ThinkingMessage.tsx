// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { AiAvatar } from "./AiMessage";

export const ThinkingMessage = ({ label }: { label: string }) => (
  <div className="flex gap-3" role="status" aria-live="polite">
    <AiAvatar />
    <div className="flex items-center gap-2 pt-1 text-[13px] text-muted">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-bamboo-500 motion-safe:animate-bounce"
            style={{ animationDelay: `${d * 120}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  </div>
);
