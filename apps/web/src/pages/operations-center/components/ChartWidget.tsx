/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { Popover } from "antd";
import type { ReactNode } from "react";

import { cn } from "../../../utils/cn";
import { tr } from "../../../i18n";

export const ChipButton = ({
  children,
  onClick,
  pressed,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={pressed}
    className={cn(
      "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
      pressed ? "bg-bamboo-100 text-bamboo-800" : "bg-canvas text-ink hover:bg-gray-200/70",
      className,
    )}
  >
    {children}
  </button>
);

export const DefinitionButton = ({ text }: { text: string }) => (
  <Popover
    content={<p className="max-w-[300px] text-[12.5px] leading-relaxed text-body">{text}</p>}
    trigger="click"
    placement="topLeft"
  >
    <span>
      <ChipButton>{tr("Định nghĩa và nguồn")}</ChipButton>
    </span>
  </Popover>
);

export const ChartWidget = ({
  title,
  meta,
  notice,
  footer,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section
    className={cn("flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card", className)}
    aria-label={title}
  >
    <header className="flex items-start justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {meta && <div className="shrink-0 text-[11.5px] text-muted">{meta}</div>}
    </header>
    {notice && <div className="mt-3">{notice}</div>}
    <div className="mt-3 min-h-0 flex-1">{children}</div>
    {footer && <footer className="mt-3 flex flex-wrap items-center gap-2">{footer}</footer>}
  </section>
);
