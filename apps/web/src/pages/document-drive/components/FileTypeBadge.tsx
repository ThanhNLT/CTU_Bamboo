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

import { cn } from "../../../utils/cn";
import { fileExtension } from "../utils";

const KIND: Array<{ exts: string[]; label?: string; className: string }> = [
  { exts: ["pdf"], className: "bg-red-50 text-red-700 border-red-100" },
  { exts: ["png", "jpg", "jpeg", "gif", "webp", "svg"], className: "bg-violet-50 text-violet-700 border-violet-100" },
  { exts: ["xls", "xlsx", "csv"], label: "XLS", className: "bg-bamboo-50 text-bamboo-700 border-bamboo-100" },
  { exts: ["doc", "docx", "odt"], label: "DOC", className: "bg-sky-50 text-sky-700 border-sky-100" },
];

export const FileTypeBadge = ({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) => {
  const ext = fileExtension(name);
  const kind = KIND.find((k) => k.exts.includes(ext));
  const label = (kind?.label ?? ext.slice(0, 4) ?? "FILE").toUpperCase() || "FILE";
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center border font-bold tracking-tight",
        size === "sm" ? "h-7 w-7 rounded-md text-[8px]" : "h-11 w-11 rounded-xl text-[10.5px]",
        kind?.className ?? "border-line bg-canvas text-muted",
      )}
    >
      {label}
    </span>
  );
};
