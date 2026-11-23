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

import { FileText, LoaderCircle, Upload } from "lucide-react";
import { useState, type DragEvent } from "react";

import { primaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { VerifyMode, VerifyResult } from "../types";
import { formatBytes } from "../utils";
import { VerificationResultCard } from "./VerificationResultCard";
import { tr } from "../../../i18n";

const MODES: Array<{ key: VerifyMode; label: string }> = [
  { key: "code", label: tr("Theo mã hồ sơ") },
  { key: "file", label: tr("Tải tệp lên") },
];

const Dropzone = ({ disabled, tall, onFile }: { disabled: boolean; tall: boolean; onFile: (f: File) => void }) => {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f && !disabled) onFile(f);
  };
  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed px-4 text-center transition-colors",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-bamboo-500",
          tall ? "py-10" : "py-6",
          over ? "border-bamboo-500 bg-bamboo-50" : "border-line bg-surface hover:border-bamboo-300 hover:bg-canvas",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Upload className="h-5 w-5 text-bamboo-600" aria-hidden />
        <span className="text-[13.5px] font-semibold text-ink">{tr("Kéo tệp vào đây để so khớp")}</span>
        <span className="text-[12px] text-muted">
          {tr("Băm SHA-256 ngay trên máy bạn (Web Crypto) · tệp không rời khỏi máy")}
        </span>
      </label>
      {tall && (
        <p className="mt-2 text-center text-[12px] text-muted">
          {tr("Chỉ gửi mã SHA-256 lên máy chủ để tìm bản niêm phong có cùng mã.")}
        </p>
      )}
    </div>
  );
};

export const VerificationPanel = ({
  code,
  onCodeChange,
  busy,
  hashing,
  result,
  onVerifyCode,
  onVerifyFile,
  onCopy,
  onCertificate,
}: {
  code: string;
  onCodeChange: (c: string) => void;
  busy: boolean;
  hashing?: { name: string; size: number };
  result?: VerifyResult;
  onVerifyCode: () => void;
  onVerifyFile: (f: File) => void;
  onCopy: () => void;
  onCertificate: () => void;
}) => {
  const [mode, setMode] = useState<VerifyMode>("code");
  const working = busy || hashing != null;

  return (
    <section
      id="ledger-panel-verify"
      role="tabpanel"
      aria-labelledby="ledger-tab-verify"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
    >
      <header>
        <h2 className="text-[15px] font-semibold text-ink">{tr("Đối soát hồ sơ")}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {tr("So khớp tệp hoặc số chứng từ với bản niêm phong trong chuỗi hash kiểm toán")}
        </p>
      </header>

      <div
        role="group"
        aria-label={tr("Cách đối soát")}
        className="inline-flex gap-0.5 self-start rounded-full bg-black/[0.045] p-1"
      >
        {MODES.map((m) => {
          const active = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(m.key)}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                active ? "bg-segment font-semibold text-ink shadow-card" : "text-body hover:text-ink",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "code" && (
        <form
          className="flex flex-col gap-2.5 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!working && code.trim()) onVerifyCode();
          }}
        >
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">{tr("Mã hồ sơ cần đối soát")}</span>
            <FileText
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="PR-2026-000012"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-ui border border-transparent bg-canvas pl-10 pr-3 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-bamboo-400 focus:bg-surface focus:ring-3 focus:ring-bamboo-100"
            />
          </label>
          <button type="submit" disabled={working || !code.trim()} className={cn(primaryButtonClass, "justify-center")}>
            {busy && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden />}
            {busy ? tr("Đang đối soát…") : tr("Đối soát")}
          </button>
        </form>
      )}

      <Dropzone
        disabled={working}
        tall={mode === "file"}
        onFile={(f) => {
          setMode("file");
          onVerifyFile(f);
        }}
      />

      {hashing && (
        <p className="flex items-center gap-2 text-[12.5px] text-body" role="status">
          <LoaderCircle className="h-4 w-4 text-bamboo-600 motion-safe:animate-spin" aria-hidden />
          {tr("Đang băm ")} <b className="font-semibold">{hashing.name}</b> ({formatBytes(hashing.size)}
          {tr(") và tra bản niêm phong…")}
        </p>
      )}

      {result && !hashing && <VerificationResultCard result={result} onCopy={onCopy} onCertificate={onCertificate} />}
    </section>
  );
};
