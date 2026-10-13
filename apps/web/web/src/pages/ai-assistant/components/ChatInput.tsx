// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { ArrowRight, Paperclip, Square, X } from "lucide-react"; // Lucide React
import { useEffect, useRef } from "react"; // React

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";

// ===== Hằng số =====
const MAX_HEIGHT = 140;

// ===== Component =====
/**
 * Ô nhập: Enter để gửi, Shift+Enter xuống dòng. Bỏ qua Enter khi đang gõ bộ gõ tiếng Việt (IME) chưa xong chữ.
 * Khi trợ lý đang trả lời, nút gửi thành nút dừng.
 */
export const ChatInput = ({
  value,
  onChange,
  files,
  onAddFiles,
  onRemoveFile,
  onSend,
  onStop,
  responding,
}: {
  value: string;
  onChange: (v: string) => void;
  files: string[];
  onAddFiles: (names: string[]) => void;
  onRemoveFile: (name: string) => void;
  onSend: () => void;
  onStop: () => void;
  responding: boolean;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = !responding && (value.trim().length > 0 || files.length > 0);

  // Tự giãn chiều cao theo nội dung (tối đa ~5 dòng); gửi xong thì thu về một dòng.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Ô trống: giữ một dòng (đừng để placeholder dài trên màn hình hẹp kéo giãn ô).
    if (!value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="rounded-[22px] border border-line bg-white px-2 py-1.5 shadow-float">
      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 px-2 pb-1 pt-1.5">
          {files.map((f) => (
            <li
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-canvas py-0.5 pl-2.5 pr-1 text-[12px] text-body"
            >
              <Paperclip className="h-3 w-3" aria-hidden />
              {f}
              <button
                type="button"
                onClick={() => onRemoveFile(f)}
                aria-label={`Bỏ tệp ${f}`}
                className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/[0.06]"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5">
        <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink focus-within:outline-2 focus-within:outline-bamboo-500">
          <input
            type="file"
            multiple
            className="sr-only"
            aria-label="Đính kèm tệp"
            onChange={(e) => {
              const names = Array.from(e.target.files ?? [], (f) => f.name);
              if (names.length) onAddFiles(names);
              e.target.value = "";
            }}
          />
          <Paperclip className="h-4 w-4" aria-hidden />
        </label>
        <textarea
          ref={ref}
          id="assistant-input"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Hỏi về hồ sơ, số liệu, quy chế, thiết bị… (Enter để gửi)"
          aria-label="Câu hỏi cho trợ lý"
          className="h-9 max-h-[140px] min-h-9 flex-1 resize-none bg-transparent font-sans px-1 py-2 text-[13.5px] leading-5 text-ink outline-none placeholder:text-muted"
        />
        {responding ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Dừng trả lời"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white hover:bg-body"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Gửi"
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
              canSend ? "bg-bamboo-600 hover:bg-bamboo-700" : "cursor-not-allowed bg-bamboo-300",
            )}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};
