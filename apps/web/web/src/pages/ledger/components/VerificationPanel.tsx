// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { FileText, LoaderCircle, Upload } from "lucide-react"; // Lucide React
import { useState, type DragEvent } from "react"; // React

// ===== Module nội bộ =====
import { primaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { VerifyMode, VerifyResult } from "../types";
import { formatBytes } from "../utils";
import { VerificationResultCard } from "./VerificationResultCard";

// ===== Hằng số =====
const MODES: Array<{ key: VerifyMode; label: string }> = [
  { key: "code", label: "Theo mã hồ sơ" },
  { key: "file", label: "Tải tệp lên" },
];

// ===== Component =====
/** Vùng kéo-thả tệp. Bấm (hoặc Enter/Space khi đang focus) để mở hộp chọn tệp. */
const Dropzone = ({
  disabled,
  tall,
  onFile,
  onSampleDownload,
}: {
  disabled: boolean;
  tall: boolean;
  onFile: (f: File) => void;
  onSampleDownload: () => void;
}) => {
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
          over ? "border-bamboo-500 bg-bamboo-50" : "border-line bg-white hover:border-bamboo-300 hover:bg-canvas",
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
        <span className="text-[13.5px] font-semibold text-ink">Kéo tệp vào đây để so khớp</span>
        <span className="text-[12px] text-muted">
          Băm SHA-256 ngay trên máy bạn (Web Crypto) · tệp không rời khỏi máy
        </span>
      </label>
      {tall && (
        <p className="mt-2 text-center text-[12px] text-muted">
          Chưa có tệp để thử?{" "}
          <button
            type="button"
            onClick={onSampleDownload}
            className="font-semibold text-bamboo-700 underline-offset-2 hover:underline"
          >
            Tải tệp mẫu HS-SEMI-2026-00125 v3
          </button>
        </p>
      )}
    </div>
  );
};

/** Cột trái tab Đối soát: đối soát theo mã hồ sơ hoặc theo tệp, và khối kết quả. */
export const VerificationPanel = ({
  code,
  onCodeChange,
  busy,
  hashing,
  result,
  onVerifyCode,
  onVerifyFile,
  onSampleDownload,
  onCopy,
  onCertificate,
}: {
  code: string;
  onCodeChange: (c: string) => void;
  /** Đang truy vấn sổ cái. */
  busy: boolean;
  /** Đang băm tệp: tên + dung lượng. */
  hashing?: { name: string; size: number };
  result?: VerifyResult;
  onVerifyCode: () => void;
  onVerifyFile: (f: File) => void;
  onSampleDownload: () => void;
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
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card"
    >
      <header>
        <h2 className="text-[15px] font-semibold text-ink">Đối soát hồ sơ</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">So khớp tệp hoặc mã hồ sơ với bản niêm phong trên sổ cái</p>
      </header>

      <div
        role="group"
        aria-label="Cách đối soát"
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
                active ? "bg-white font-semibold text-ink shadow-card" : "text-body hover:text-ink",
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
            <span className="sr-only">Mã hồ sơ cần đối soát</span>
            <FileText
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="HS-SEMI-2026-00123"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-transparent bg-canvas pl-10 pr-3 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-bamboo-400 focus:bg-white focus:ring-3 focus:ring-bamboo-100"
            />
          </label>
          <button type="submit" disabled={working || !code.trim()} className={cn(primaryButtonClass, "justify-center")}>
            {busy && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden />}
            {busy ? "Đang đối soát…" : "Đối soát"}
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
        onSampleDownload={onSampleDownload}
      />

      {hashing && (
        <p className="flex items-center gap-2 text-[12.5px] text-body" role="status">
          <LoaderCircle className="h-4 w-4 text-bamboo-600 motion-safe:animate-spin" aria-hidden />
          Đang băm <b className="font-semibold">{hashing.name}</b> ({formatBytes(hashing.size)}) và tra sổ cái…
        </p>
      )}

      {result && !hashing && <VerificationResultCard result={result} onCopy={onCopy} onCertificate={onCertificate} />}
    </section>
  );
};
