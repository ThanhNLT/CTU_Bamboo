// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Check, Copy } from "lucide-react"; // Lucide React
import { useEffect, useRef, useState } from "react"; // React

// ===== Module nội bộ =====
import { copyText } from "../utils";

// ===== Component =====
/** Khối code có tiêu đề và nút "Sao chép" (đổi thành "Đã chép" trong 1,5 giây). */
export const CodeSnippet = ({ title, code, language }: { title: string; code: string; language: string }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(code))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-canvas px-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-gray-200/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-bamboo-600" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          <span aria-live="polite">{copied ? "Đã chép" : "Sao chép"}</span>
        </button>
      </div>
      <pre
        className="mt-2.5 overflow-x-auto rounded-xl border border-line bg-canvas px-4 py-3.5 font-mono text-[12px] leading-relaxed text-ink"
        data-language={language}
      >
        <code>{code}</code>
      </pre>
    </section>
  );
};
