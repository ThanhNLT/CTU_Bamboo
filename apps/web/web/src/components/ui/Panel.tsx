// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "../../utils/cn";
import { TONE_DOT, type Tone } from "./tone";

export const Panel = ({
  title,
  extra,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section
    className={cn("min-w-0 rounded-2xl border border-line bg-surface shadow-card", className)}
    aria-label={typeof title === "string" ? title : undefined}
  >
    {(title || extra) && (
      <header className="flex min-h-[56px] items-center justify-between gap-3 px-5 pt-3">
        {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
        {extra}
      </header>
    )}
    <div className={bodyClassName ?? "px-5 pb-5"}>{children}</div>
  </section>
);

export const PanelLink = ({ to, onClick, children }: { to?: string; onClick?: () => void; children: ReactNode }) => {
  const cls =
    "text-[12.5px] font-semibold text-bamboo-700 hover:text-bamboo-800 hover:underline underline-offset-2 disabled:cursor-default disabled:text-muted disabled:no-underline";
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={!onClick} className={cls}>
      {children}
    </button>
  );
};

export const Dot = ({ tone, size = "sm", className }: { tone: Tone; size?: "sm" | "md"; className?: string }) => (
  <span
    className={cn(
      "inline-block shrink-0 rounded-ui",
      size === "md" ? "h-2 w-2" : "h-1.5 w-1.5",
      TONE_DOT[tone],
      className,
    )}
    aria-hidden
  />
);
