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

import type { ReactNode } from "react";

import { cn } from "../../utils/cn";

/** Page header for list pages: big title, one-line description, actions on the right. */
export const ListPageHeader = ({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
  </div>
);

/** Card that frames a list table: title + meta row, optional filter toolbar, then the table. */
export const ListCard = ({
  title,
  meta,
  toolbar,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section
    aria-label={title}
    className={cn("min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card", className)}
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {meta && <span className="text-[11.5px] text-muted">{meta}</span>}
    </div>
    {toolbar && <div className="mt-4 flex flex-wrap items-center gap-3">{toolbar}</div>}
    <div className="mt-3">{children}</div>
  </section>
);

/** Layout wrapper shared by list pages. */
export const ListPage = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">{children}</div>
);

/** Primary cell: bold name with a small monospace line underneath (document number, code…). */
export const CellTitle = ({ title, sub }: { title: ReactNode; sub?: ReactNode }) => (
  <>
    <span className="block font-semibold text-ink">{title}</span>
    {sub && <span className="block font-mono text-[11px] text-muted">{sub}</span>}
  </>
);

/** Secondary cell: regular text with an optional muted line underneath. */
export const CellText = ({ main, sub }: { main: ReactNode; sub?: ReactNode }) => (
  <>
    <span className="block text-body">{main}</span>
    {sub && <span className="block text-[11px] text-muted">{sub}</span>}
  </>
);

/** Status shown as a coloured dot + label, as on the AI agents table. */
export const DotLabel = ({ dot, label, muted }: { dot: string; label: ReactNode; muted?: boolean }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 text-[11.5px]",
      muted ? "text-muted" : "text-ink",
    )}
  >
    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
    {label}
  </span>
);

/** Round icon button used in the trailing action column. */
export const iconActionClass =
  "grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-black/[0.05] hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:opacity-50";
