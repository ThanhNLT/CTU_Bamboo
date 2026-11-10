/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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
