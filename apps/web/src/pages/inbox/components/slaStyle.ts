import type { Tone } from "../../../components/ui";
import type { SlaLevel } from "../types";

export const SLA_TONE: Record<SlaLevel, Tone> = { overdue: "danger", urgent: "warning", ok: "success" };

export const SLA_PILL: Record<SlaLevel, string> = {
  overdue: "bg-red-50 text-red-700",
  urgent: "bg-amber-50 text-amber-800",
  ok: "bg-bamboo-50 text-bamboo-700",
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
