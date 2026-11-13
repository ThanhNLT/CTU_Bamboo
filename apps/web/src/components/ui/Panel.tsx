/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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
    className={cn("min-w-0 rounded-2xl border bg-surface shadow-card", className)}
    aria-label={typeof title === "string" ? title : undefined}
  >
    {(title || extra) && (
      <header className="flex min-h-[56px] items-center justify-between gap-3 px-5 pt-3">
        {title && <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
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
      "inline-block shrink-0 rounded-full",
      size === "md" ? "h-2 w-2" : "h-1.5 w-1.5",
      TONE_DOT[tone],
      className,
    )}
    aria-hidden
  />
);
