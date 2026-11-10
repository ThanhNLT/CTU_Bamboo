/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { BookOpen, Cpu, Database, Download, FileText, FolderClosed, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { StatusTag } from "../../../components/StatusTag";
import { cn } from "../../../utils/cn";
import { highlight } from "../engine";
import type { ResultType, SearchResult } from "../types";
import { tr, trf } from "../../../i18n";

const ICON: Record<ResultType, { icon: LucideIcon; className: string }> = {
  twin: { icon: Cpu, className: "bg-bamboo-50 text-bamboo-700" },
  record: { icon: FileText, className: "bg-canvas text-body" },
  knowledge: { icon: BookOpen, className: "bg-canvas text-body" },
  document: { icon: FolderClosed, className: "bg-canvas text-body" },
  data: { icon: Database, className: "bg-bamboo-50 text-bamboo-700" },
};

const MARK = "rounded-ui bg-yellow-100 text-ink";

const Highlighted = ({ text, terms }: { text: string; terms: string[] }) => (
  <>
    {highlight(text, terms).map((s, i) =>
      s.mark ? (
        <mark key={i} className={MARK}>
          {s.text}
        </mark>
      ) : (
        <span key={i}>{s.text}</span>
      ),
    )}
  </>
);

const fmtScore = (n: number) => n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ResultItem = ({
  result,
  terms,
  onDownload,
}: {
  result: SearchResult;
  terms: string[];
  onDownload: (attachmentId: string) => void;
}) => {
  const { icon: Icon, className } = ICON[result.type];
  return (
    <li className="flex gap-3 border-b border-line/70 py-3.5 last:border-b-0">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", className)} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={result.to}
            className={cn(
              "min-w-0 break-words text-[14px] font-semibold text-ink underline-offset-2 hover:text-bamboo-700 hover:underline",
              result.mono && "font-mono text-[13px]",
            )}
          >
            {result.code && (
              <span className="mr-1.5 font-mono text-[12.5px] font-medium text-muted">{result.code}</span>
            )}
            <Highlighted text={result.title} terms={terms} />
          </Link>
          {result.status && <StatusTag status={result.status} />}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted">{result.breadcrumb}</div>

        {result.snippetHtml ? (
          <p
            className="mt-1.5 text-[13px] leading-relaxed text-body [&_mark]:rounded-ui [&_mark]:bg-yellow-100 [&_mark]:text-ink"
            dangerouslySetInnerHTML={{ __html: result.snippetHtml }}
          />
        ) : result.snippet ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-body">
            <Highlighted text={result.snippet} terms={terms} />
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {result.semantic != null && (
            <span className="inline-flex h-6 items-center rounded-full border border-bamboo-200 bg-bamboo-50 px-2.5 font-medium text-bamboo-800">
              {tr("Khớp ý nghĩa ")} {fmtScore(result.semantic)}
            </span>
          )}
          {result.keyword && (
            <span className="inline-flex h-6 items-center rounded-full border border-line bg-surface px-2.5 font-medium text-body">
              {result.matchedField ? trf("Khớp từ khóa · {0}", [result.matchedField]) : tr("Khớp từ khóa")}
            </span>
          )}
          {result.updatedLabel && (
            <span className="inline-flex h-6 items-center rounded-full bg-black/[0.045] px-2.5 font-medium text-body">
              {result.updatedLabel}
            </span>
          )}
          {result.attachmentId && (
            <button
              type="button"
              onClick={() => result.attachmentId && onDownload(result.attachmentId)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2.5 font-medium text-ink hover:bg-canvas"
            >
              <Download className="h-3 w-3" aria-hidden />
              {tr("Tải tệp")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
};
