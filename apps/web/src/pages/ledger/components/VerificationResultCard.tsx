/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import { Copy, Download, SearchX, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../../utils/cn";
import type { VerifyResult } from "../types";
import { shortHash } from "../utils";
import { tr, trf } from "../../../i18n";

const Row = ({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) => (
  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-1.5 sm:grid-cols-[110px_minmax(0,1fr)]">
    <dt className="text-[12px] text-muted">{label}</dt>
    <dd
      className={cn("m-0 min-w-0 text-[12.5px] text-ink", mono && "break-all font-mono text-[11.5px] leading-relaxed")}
    >
      {children}
    </dd>
  </div>
);

const actionClass =
  "inline-flex h-8 items-center gap-1.5 rounded-full border bg-surface/70 px-3 text-[12px] font-medium text-ink transition-colors hover:bg-surface " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";

const STYLE = {
  match: { box: "border-bamboo-200 bg-bamboo-50", title: "text-bamboo-800", action: "border-bamboo-200" },
  mismatch: { box: "border-red-200 bg-red-50", title: "text-red-700", action: "border-red-200" },
  not_found: { box: "border-amber-200 bg-amber-50", title: "text-amber-800", action: "border-amber-200" },
} as const;

export const VerificationResultCard = ({
  result,
  onCopy,
  onCertificate,
}: {
  result: VerifyResult;
  onCopy: () => void;
  onCertificate: () => void;
}) => {
  const st = STYLE[result.kind];
  return (
    <section aria-live="polite" aria-label={tr("Kết quả đối soát")} className={cn("rounded-2xl border p-4", st.box)}>
      <h3 className={cn("flex items-center gap-2 text-[13.5px] font-semibold", st.title)}>
        {result.kind === "match" && <ShieldCheck className="h-4 w-4" aria-hidden />}
        {result.kind === "mismatch" && <ShieldAlert className="h-4 w-4" aria-hidden />}
        {result.kind === "not_found" && <SearchX className="h-4 w-4" aria-hidden />}
        {result.kind === "match"
          ? tr("Khớp với bản niêm phong")
          : result.kind === "mismatch"
            ? tr("Không khớp với bản niêm phong")
            : tr("Không tìm thấy bản niêm phong")}
      </h3>

      {result.kind === "not_found" ? (
        <div className="mt-2 text-[12.5px] text-body">
          {result.via === "code" ? (
            <p>
              {tr("Không có bản niêm phong nào cho ")} <b className="font-mono font-semibold">{result.query}</b>{" "}
              {tr(
                " trong các chứng từ bạn được xem. Kiểm tra lại số chứng từ (dạng PR-2026-000012, có thể thêm “v2” để chọn tệp thứ hai).",
              )}
            </p>
          ) : (
            <>
              <p>
                {tr("Mã băm của tệp ")} <b className="font-semibold">{result.fileName}</b>{" "}
                {tr(
                  " không khớp tệp nào đã được nhận vào hệ thống (trong các chứng từ bạn được xem). Tệp có thể đã bị chỉnh sửa, hoặc chưa từng được tải lên.",
                )}
              </p>
              {result.sha256 && (
                <p className="mt-2 break-all font-mono text-[11.5px] text-muted">SHA-256 {result.sha256}</p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <dl className="m-0 mt-2">
            <Row label={tr("Hồ sơ")} mono>{`${result.seal.code} · v${result.seal.version}`}</Row>
            <Row label={tr("Tệp")}>{result.seal.fileName}</Row>
            <Row label={tr("Niêm phong")}>{trf("{0} · chuỗi {1}", [result.seal.sealedAt, result.seal.channel])}</Row>
            <Row label={tr("Nhật ký")} mono>
              {result.seal.txId ? (
                <span title={result.seal.txId}>
                  #{result.seal.block} · {shortHash(result.seal.txId)}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label={result.kind === "mismatch" ? tr("SHA-256 niêm phong") : "SHA-256"} mono>
              {result.seal.sha256}
            </Row>
            {result.kind === "mismatch" && (
              <Row label={tr("SHA-256 tệp lưu")} mono>
                <span className="text-red-700">{result.actualSha256 ?? "—"}</span>
              </Row>
            )}
            {result.fileName && <Row label={tr("Tệp đối soát")}>{result.fileName}</Row>}
          </dl>
          {result.kind === "mismatch" && result.problem && (
            <p className="mt-2 rounded-xl bg-surface/70 px-3 py-2 text-[12px] text-body">{result.problem}</p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onCopy} className={cn(actionClass, st.action)}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {tr("Sao chép bằng chứng")}
        </button>
        {result.kind !== "not_found" && (
          <button type="button" onClick={onCertificate} className={cn(actionClass, st.action)}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {result.kind === "match" ? tr("Tải chứng nhận PDF") : tr("Tải biên bản PDF")}
          </button>
        )}
      </div>
    </section>
  );
};
