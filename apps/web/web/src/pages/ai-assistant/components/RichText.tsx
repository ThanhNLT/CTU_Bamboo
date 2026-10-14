// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";

import { parseRich } from "../assistant";
import type { Citation } from "../types";

export const RichText = ({ text, sources = [] }: { text: string; sources?: Citation[] }) => (
  <p className="text-[13.5px] leading-relaxed text-ink">
    {parseRich(text).map((p, i) => {
      if (p.type === "bold")
        return (
          <b key={i} className="font-semibold">
            {p.value}
          </b>
        );
      if (p.type === "text") return <span key={i}>{p.value}</span>;
      const src = sources.find((s) => s.id === p.id);
      return src ? (
        <Link
          key={i}
          to={src.to}
          title={src.label}
          className="mx-px rounded px-0.5 text-[12px] font-semibold text-bamboo-700 hover:bg-bamboo-50"
        >
          [{p.id}]
        </Link>
      ) : (
        <span key={i}>[{p.id}]</span>
      );
    })}
  </p>
);
