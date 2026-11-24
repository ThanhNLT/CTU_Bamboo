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

import { Sparkles } from "lucide-react";

import type { Concept, SearchMode } from "../types";
import { tr } from "../../../i18n";

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
            {tr("Đã hiểu là:")}{" "}
            {concepts.map((c, i) => (
              <span key={c.key}>
                {i > 0 && " + "}
                <b className="font-semibold text-ink">{c.label}</b>
              </span>
            ))}
            {tr(" · gồm cả ")}
            {concepts
              .flatMap((c) => c.synonyms)
              .map((s) => `“${s}”`)
              .join(", ")}
          </span>
        ) : mode === "keyword" ? (
          <span>
            {tr("Tìm chính xác theo từ khóa ")} <b className="font-semibold text-ink">“{query}”</b>{" "}
            {tr(" · chuyển sang “Kết hợp” để tìm cả cách nói khác")}
          </span>
        ) : mode === "semantic" ? (
          <span>
            {tr("Tìm theo ý nghĩa của ")} <b className="font-semibold text-ink">“{query}”</b>{" "}
            {tr(" · ra cả chứng từ dùng cách nói khác, không chứa đúng từ đã gõ")}
          </span>
        ) : (
          <span>
            {tr("Tìm theo từ khóa ")} <b className="font-semibold text-ink">“{query}”</b>{" "}
            {tr(" · sau đó thêm các chứng từ gần về ý nghĩa")}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onAsk}
        className="inline-flex h-8 shrink-0 items-center self-start rounded-full bg-bamboo-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-bamboo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 sm:self-auto"
      >
        {tr("Hỏi trợ lý về kết quả này")}
      </button>
    </div>
  );
};
