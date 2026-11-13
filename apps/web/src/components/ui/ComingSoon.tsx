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

import { Workflow } from "lucide-react";

import { Panel } from "./Panel";
import { tr } from "../../i18n";

export const ComingSoon = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
    <h1 className="m-0 text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
    <Panel>
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center" role="status">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bamboo-700/10 text-bamboo-700">
          <Workflow className="h-7 w-7" strokeWidth={1.6} aria-hidden />
        </span>
        <p className="m-0 text-[17px] font-semibold text-ink">{tr("Sẽ được cập nhật chức năng sau")}</p>
        {hint && <p className="m-0 max-w-md text-[13px] text-muted">{hint}</p>}
      </div>
    </Panel>
  </div>
);
