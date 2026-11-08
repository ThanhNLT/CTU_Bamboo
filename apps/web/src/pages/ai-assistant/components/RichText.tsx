import { Link } from "react-router";

import { citationLabel, citationLink, namedBefore, parseRich, shortTitle } from "../assistant";
import type { Citation } from "../types";

const cite =
  "mx-0.5 inline-flex max-w-[16rem] items-baseline gap-1 truncate rounded-md bg-bamboo-50 px-1.5 align-baseline " +
  "text-[11.5px] font-semibold text-bamboo-800 no-underline hover:bg-bamboo-100";

/** Câu trả lời có in đậm và trích dẫn; trích dẫn mang tên văn bản (chỉ hiện số khi câu vừa nêu tên văn bản đó). */
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
