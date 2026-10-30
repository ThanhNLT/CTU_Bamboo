// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Popover } from "antd";
import type { ReactNode } from "react";

import { cn } from "../../../utils/cn";

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
      "inline-flex h-7 items-center gap-1.5 rounded-ui px-3 text-[11.5px] font-medium transition-colors",
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
      <ChipButton>Định nghĩa và nguồn</ChipButton>
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
