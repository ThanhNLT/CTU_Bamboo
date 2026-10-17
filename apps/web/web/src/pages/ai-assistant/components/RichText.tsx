// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router";

import { citationLabel, citationLink, parseRich } from "../assistant";
import type { Citation } from "../types";

export const RichText = ({ text, citations = [] }: { text: string; citations?: Citation[] }) => (
  <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">
    {parseRich(text).map((p, i) => {
      if (p.type === "bold")
        return (
          <b key={i} className="font-semibold">
            {p.value}
          </b>
        );
      if (p.type === "text") return <span key={i}>{p.value}</span>;
      const c = citations.find((x) => x.n === p.n);
      return c ? (
        <Link
          key={i}
          to={citationLink(c)}
          title={citationLabel(c)}
          className="mx-px rounded px-0.5 text-[12px] font-semibold text-bamboo-700 hover:bg-bamboo-50"
        >
          [{p.n}]
        </Link>
      ) : (
        <span key={i}>[{p.n}]</span>
      );
    })}
  </p>
);
