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

import type { DriveFile, SortKey } from "./types";

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  return `${num.format(value)} ${units[i]}`;
};

export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const blocked = (f: DriveFile) => f.scan === "infected" || f.scan === "rejected";

export const sortFiles = (files: DriveFile[], key: SortKey) =>
  [...files].sort((a, b) => {
    if (blocked(a) !== blocked(b)) return blocked(a) ? 1 : -1;
    if (key === "name") return a.name.localeCompare(b.name, "vi");
    if (key === "size") return (b.bytes ?? 0) - (a.bytes ?? 0);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
