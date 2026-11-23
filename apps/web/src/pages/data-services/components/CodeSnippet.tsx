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

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { copyText } from "../utils";
import { tr } from "../../../i18n";

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
          <span aria-live="polite">{copied ? tr("Đã chép") : tr("Sao chép")}</span>
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
