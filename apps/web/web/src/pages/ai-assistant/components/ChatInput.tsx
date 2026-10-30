// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../../utils/cn";

const MAX_HEIGHT = 140;
export const MAX_QUESTION = 2000;

export const ChatInput = ({
  value,
  onChange,
  onSend,
  busy,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  disabled?: boolean;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = !busy && !disabled && value.trim().length > 0 && value.length <= MAX_QUESTION;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="rounded-ui border border-line bg-surface px-2 py-1.5 shadow-float">
      <div className="flex items-end gap-1.5">
        <textarea
          ref={ref}
          id="assistant-input"
          rows={1}
          value={value}
          maxLength={MAX_QUESTION}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Hỏi về quy chế, quy trình, hướng dẫn trong Thư viện tri thức… (Enter để gửi)"
          aria-label="Câu hỏi cho trợ lý"
          className="h-9 max-h-[140px] min-h-9 flex-1 resize-none bg-transparent font-sans px-2 py-2 text-[13.5px] leading-5 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Gửi"
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-ui text-white transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
            canSend ? "bg-bamboo-600 hover:bg-bamboo-700" : "cursor-not-allowed bg-bamboo-300",
          )}
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
};
