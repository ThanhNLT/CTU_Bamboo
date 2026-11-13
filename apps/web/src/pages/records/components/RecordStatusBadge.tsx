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

import { Lock } from "lucide-react";

import { Dot } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import type { RecordStatus } from "../types";
import { STATUS_VIEW } from "../utils";

const PILL: Record<string, string> = {
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  success: "bg-bamboo-50 text-bamboo-700",
  neutral: "bg-canvas text-body",
};

export const RecordStatusBadge = ({
  status,
  label,
  pill = false,
}: {
  status: RecordStatus;
  label: string;
  pill?: boolean;
}) => {
  const v = STATUS_VIEW[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        pill ? cn("rounded-ui px-2.5 py-0.5 text-[11.5px] font-medium", PILL[v.tone]) : "text-[12.5px] text-body",
      )}
    >
      {v.locked ? <Lock className="h-3 w-3 text-muted" strokeWidth={2} aria-hidden /> : <Dot tone={v.tone} size="md" />}
      {label}
    </span>
  );
};
