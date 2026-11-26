/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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
