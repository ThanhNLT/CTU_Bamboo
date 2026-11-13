/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../../utils/cn";
import { tr } from "../../../i18n";

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
          placeholder={tr("Hỏi về quy chế, quy trình, hướng dẫn trong Thư viện tri thức… (Enter để gửi)")}
          aria-label={tr("Câu hỏi cho trợ lý")}
          className="h-9 max-h-[140px] min-h-9 flex-1 resize-none bg-transparent font-sans px-2 py-2 text-[13.5px] leading-5 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label={tr("Gửi")}
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white transition-colors",
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
