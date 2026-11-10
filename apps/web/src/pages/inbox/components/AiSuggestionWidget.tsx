import { Sparkles } from "lucide-react";
import { Link } from "react-router";

import type { AiSuggestion } from "../types";
import { tr } from "../../../i18n";

export const AiSuggestionWidget = ({ suggestion }: { suggestion?: AiSuggestion }) => (
  <section className="rounded-2xl border border-bamboo-100 bg-bamboo-50/60 p-4" aria-labelledby="inbox-ai">
    <h3 id="inbox-ai" className="flex items-center gap-2 text-[14px] font-semibold text-ink">
      <Sparkles className="h-4 w-4 text-bamboo-600" strokeWidth={2} aria-hidden />
      {tr("Gợi ý của trợ lý")}
    </h3>
    {suggestion ? (
      <>
        <ul className="m-0 mt-2.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-body marker:text-bamboo-500">
          {suggestion.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {suggestion.citation && (
          <Link
            to={suggestion.citation.to}
            className="mt-2.5 inline-block text-[12px] text-bamboo-700 hover:underline underline-offset-2"
          >
            {suggestion.citation.label}
          </Link>
        )}
      </>
    ) : (
      <p className="mt-2 text-[12.5px] text-muted">{tr("Trợ lý chưa có gợi ý cho hồ sơ này.")}</p>
    )}
    <p className="mt-2.5 text-[11.5px] text-muted">{tr("Chỉ là gợi ý – quyết định thuộc về bạn.")}</p>
  </section>
);
