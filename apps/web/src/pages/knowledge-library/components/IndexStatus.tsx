/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Dot } from "../../../components/ui";
import type { IndexState } from "../types";
import { VIEW } from "./indexState";

export const IndexStatus = ({ state }: { state: IndexState }) => {
  const v = VIEW[state.status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] ${v.text}`}>
      <Dot tone={v.tone} className={state.status === "indexing" ? "motion-safe:animate-pulse" : undefined} />
      {v.label}
    </span>
  );
};
