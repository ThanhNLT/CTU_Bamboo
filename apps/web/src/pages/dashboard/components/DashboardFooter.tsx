/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { tr } from "../../../i18n";

const SOURCE_URL: string | undefined = import.meta.env.VITE_SOURCE_URL;

export const DashboardFooter = () => (
  <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-[11.5px] text-muted">
    <span>BAMBOO v0.x · Apache-2.0</span>
    {SOURCE_URL ? (
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        className="text-muted underline underline-offset-2 hover:text-ink"
      >
        {tr("Mã nguồn")}
      </a>
    ) : (
      <span className="underline underline-offset-2">{tr("Mã nguồn")}</span>
    )}
    <span>{tr("Dữ liệu demo")}</span>
  </footer>
);
