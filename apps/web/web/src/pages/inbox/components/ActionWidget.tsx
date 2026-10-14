// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useId, useState } from "react";

import { cn } from "../../../utils/cn";
import type { Decision } from "../types";

const base =
  "inline-flex h-10 items-center justify-center rounded-full text-[13.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const ActionWidget = ({
  taskKey,
  disabledReason,
  onDecide,
}: {
  taskKey: string;
  disabledReason?: string;
  onDecide: (decision: Decision, comment: string) => void;
}) => {
  const id = useId();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComment("");
    setError(null);
  }, [taskKey]);

  const decide = (d: Decision) => {
    if (d !== "approve" && !comment.trim()) {
      setError(d === "return" ? "Nhập ý kiến để người nộp biết cần bổ sung gì." : "Nhập lý do từ chối.");
      document.getElementById(`${id}-comment`)?.focus();
      return;
    }
    setError(null);
    onDecide(d, comment.trim());
  };

  const disabled = Boolean(disabledReason);

  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-[14px] font-semibold text-ink">
        Ý kiến
      </h3>
      <label htmlFor={`${id}-comment`} className="sr-only">
        Ý kiến của bạn
      </label>
      <textarea
        id={`${id}-comment`}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          if (error) setError(null);
        }}
        disabled={disabled}
        rows={3}
        maxLength={2000}
        placeholder="Bắt buộc khi trả lại hoặc từ chối"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "mt-2.5 block w-full resize-y rounded-xl border bg-canvas px-3 py-2 text-[13px] text-ink outline-none transition-colors",
          "placeholder:text-muted focus:bg-white focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-red-300 focus:ring-red-100" : "border-line focus:border-bamboo-400 focus:ring-bamboo-100",
        )}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-red-600">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => decide("approve")}
          className={cn(
            base,
            "w-full bg-bamboo-600 font-semibold text-white shadow-[0_1px_2px_rgb(31_81_42/0.25)] hover:bg-bamboo-700 focus-visible:outline-bamboo-500",
          )}
        >
          Duyệt
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => decide("return")}
            className={cn(
              base,
              "border border-line bg-canvas font-medium text-ink hover:bg-gray-200/60 focus-visible:outline-bamboo-500",
            )}
          >
            Trả lại
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => decide("reject")}
            className={cn(
              base,
              "border border-red-300 bg-white font-medium text-red-600 hover:bg-red-50 focus-visible:outline-red-500",
            )}
          >
            Từ chối
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        {disabledReason ?? "Mọi quyết định đều qua hộp xác nhận và ghi nhật ký kiểm toán."}
      </p>
    </section>
  );
};
