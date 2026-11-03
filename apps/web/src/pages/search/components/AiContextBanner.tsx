// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Sparkles } from "lucide-react";

import type { Concept, SearchMode } from "../types";

export const AiContextBanner = ({
  query,
  mode,
  concepts,
  onAsk,
}: {
  query: string;
  mode: SearchMode;
  concepts: Concept[];
  onAsk: () => void;
}) => {
  const understood = mode !== "keyword" && concepts.length > 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-bamboo-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-start gap-2.5 text-[13px] text-body">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-bamboo-600" aria-hidden />
        {understood ? (
          <span>
            Đã hiểu là:{" "}
            {concepts.map((c, i) => (
              <span key={c.key}>
                {i > 0 && " + "}
                <b className="font-semibold text-ink">{c.label}</b>
              </span>
            ))}
            {" · gồm cả "}
            {concepts
              .flatMap((c) => c.synonyms)
              .map((s) => `“${s}”`)
              .join(", ")}
          </span>
        ) : mode === "keyword" ? (
          <span>
            Tìm chính xác theo từ khóa <b className="font-semibold text-ink">“{query}”</b> · chuyển sang “Kết hợp” để
            tìm cả cách nói khác
          </span>
        ) : (
          <span>
            Chưa nhận ra ý định cụ thể, đang tìm theo từ khóa <b className="font-semibold text-ink">“{query}”</b>
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onAsk}
        className="inline-flex h-8 shrink-0 items-center self-start rounded-ui bg-bamboo-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-bamboo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 sm:self-auto"
      >
        Hỏi trợ lý về kết quả này
      </button>
    </div>
  );
};
