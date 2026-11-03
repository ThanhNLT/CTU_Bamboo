// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

const base =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-[18px] text-[13.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:opacity-50";

export const secondaryButtonClass = `${base} border border-[var(--glass-card-edge)] bg-[var(--glass-card)] font-medium text-ink shadow-card backdrop-blur-xl hover:bg-bamboo-50`;

export const primaryButtonClass = `${base} bg-bamboo-600 font-semibold text-white shadow-glass-active hover:bg-[#2a6e38] active:scale-[0.98]`;

const small =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:cursor-not-allowed disabled:opacity-50";

export const smallSecondaryButtonClass = `${small} border border-line bg-canvas font-medium text-ink hover:bg-bamboo-50`;

export const smallPrimaryButtonClass = `${small} bg-bamboo-600 font-semibold text-white shadow-glass-active hover:bg-[#2a6e38]`;
