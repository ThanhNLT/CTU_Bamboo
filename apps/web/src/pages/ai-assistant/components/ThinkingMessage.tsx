/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { AiAvatar } from "./AiMessage";

export const ThinkingMessage = ({ label }: { label: string }) => (
  <div className="flex gap-3" role="status" aria-live="polite">
    <AiAvatar />
    <div className="flex items-center gap-2 pt-1 text-[13px] text-muted">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-ui bg-bamboo-500 motion-safe:animate-bounce"
            style={{ animationDelay: `${d * 120}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  </div>
);
