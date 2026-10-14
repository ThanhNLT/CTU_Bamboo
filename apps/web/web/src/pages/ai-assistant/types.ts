// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type AssistantMode = "auto" | "knowledge" | "eoffice" | "analytics" | "operations" | "documents";

export type Citation = { id: number; label: string; to: string };

export type ToolStep = { name: string; args: string; ms: number };

export type ChartPoint = {
  label: string;
  actual?: number | null;
  forecast?: number | null;
  band?: [number, number] | null;
  compare?: number | null;
};

export type ChartSpec = {
  title: string;
  link?: { label: string; to: string };
  data: ChartPoint[];
  yDomain: [number, number];
  yTicks: number[];
  legend: { actual: string; forecast?: string; band?: string; compare?: string };
  decimals: number;
  method: string;
};

export type ActionProposal = {
  title: string;
  recordType: string;
  device: string;
  description: string;
  note: string;
};

export type UserMsg = { id: string; role: "user"; text: string; files?: string[] };

export type AiMsg = {
  id: string;
  role: "assistant";
  text: string;
  chart?: ChartSpec;
  steps?: ToolStep[];
  sources?: Citation[];
  action?: ActionProposal;
};

export type Message = UserMsg | AiMsg;

export type SessionGroup = "today" | "yesterday" | "lastWeek";

export type ChatSession = {
  id: string;
  title: string;
  group: SessionGroup;
  context?: string;
  messages: Message[];
};

export type Reply = Omit<AiMsg, "id" | "role">;
