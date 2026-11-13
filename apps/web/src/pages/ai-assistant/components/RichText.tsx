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

import { Link } from "react-router";

import { citationLabel, citationLink, namedBefore, parseRich, shortTitle } from "../assistant";
import type { Citation } from "../types";

const cite =
  "mx-0.5 inline-flex max-w-[16rem] items-baseline gap-1 truncate rounded-md bg-bamboo-50 px-1.5 align-baseline " +
  "text-[11.5px] font-semibold text-bamboo-800 no-underline hover:bg-bamboo-100";

export const RichText = ({ text, citations = [] }: { text: string; citations?: Citation[] }) => {
  let before = "";
  return (
    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">
      {parseRich(text).map((p, i) => {
        if (p.type === "bold") {
          before += p.value;
          return (
            <b key={i} className="font-semibold">
              {p.value}
            </b>
          );
        }
        if (p.type === "text") {
          before += p.value;
          return <span key={i}>{p.value}</span>;
        }
        const c = citations.find((x) => x.n === p.n);
        if (!c) return <span key={i}>[{p.n}]</span>;
        const named = namedBefore(before, c);
        return (
          <Link key={i} to={citationLink(c)} title={citationLabel(c)} className={cite}>
            <span className="tabular-nums">{p.n}</span>
            {!named && <span className="truncate font-medium">{shortTitle(c)}</span>}
          </Link>
        );
      })}
    </p>
  );
};
