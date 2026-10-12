// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

/** Chế độ chuyên môn của trợ lý. "auto" = tự chọn theo câu hỏi. */
export type AssistantMode = "auto" | "knowledge" | "eoffice" | "analytics" | "operations" | "documents";

export type Citation = { id: number; label: string; to: string };

export type ToolStep = { name: string; args: string; ms: number };

export type ChartPoint = {
  label: string;
  actual?: number | null;
  forecast?: number | null;
  /** Khoảng tin cậy [thấp, cao]. */
  band?: [number, number] | null;
  /** Chuỗi so sánh (vd. cùng kỳ năm trước). */
  compare?: number | null;
};

export type ChartSpec = {
  title: string;
  link?: { label: string; to: string };
  data: ChartPoint[];
  yDomain: [number, number];
  yTicks: number[];
  /** Nhãn chú giải cho từng chuỗi. */
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
  /** Văn bản có đánh dấu tối giản: **đậm** và [1] trích nguồn. */
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
  /** Ngữ cảnh đang gắn, ví dụ "Trung tâm điều hành · OEE". */
  context?: string;
  messages: Message[];
};

/** Kết quả của bộ trả lời mẫu (chưa có id). */
export type Reply = Omit<AiMsg, "id" | "role">;
