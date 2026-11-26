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

import { Dot, type Tone } from "../../../components/ui";
import { formatInt } from "../utils";

export type LedgerStat = { key: string; label: string; value: number; note: string; tone?: Tone };

export const LedgerStats = ({ items }: { items: LedgerStat[] }) => (
  <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
    {items.map((s) => (
      <div key={s.key} className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
        <dt className="truncate text-[12px] text-muted">{s.label}</dt>
        <dd className="m-0">
          <span className="mt-1 block text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink">
            {formatInt(s.value)}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
            {s.tone && <Dot tone={s.tone} />}
            <span className="truncate">{s.note}</span>
          </span>
        </dd>
      </div>
    ))}
  </dl>
);
