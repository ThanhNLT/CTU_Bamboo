/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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
