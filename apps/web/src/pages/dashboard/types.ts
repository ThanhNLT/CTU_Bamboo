/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import type { Tone } from "../../components/ui";

export type { Tone };

export type DashboardUser = { name: string; title: string; company: string };

export type SummaryStat = {
  key: string;
  label: string;
  value: number;
  hint: string;
  tone?: Tone;
  to?: string;
};

export type DueLevel = "overdue" | "urgent" | "ok";

export type TaskItem = {
  code: string;
  to: string;
  title: string;
  dueLabel: string;
  dueLevel: DueLevel;
  dueDay: string;
};

export type RecentRecord = {
  code: string;
  title: string;
  kind: string;
  statusLabel: string;
  tone: Tone;
  locked?: boolean;
  updatedAt: string;
  to: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  to?: string;
  time: string;
  source?: string;
  tone: Tone;
  read: boolean;
};

export type PinnedKpi = {
  key: string;
  label: string;
  value: string;
  note: string;
  noteTone: Tone;
  noteMarker: "down" | "up" | "dot";
  series: number[];
  threshold?: number;
};
