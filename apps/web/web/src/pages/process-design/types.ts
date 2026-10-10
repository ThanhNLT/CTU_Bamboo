// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

export type NodeType = "start" | "userTask" | "serviceTask" | "gateway" | "end";

export type TaskDecision = "approve" | "return" | "reject";

export type BpmnNode = {
  id: string;
  type: NodeType;
  name: string;
  /** Tâm phần tử trong hệ tọa độ canvas (px ở mức zoom 100%). */
  x: number;
  y: number;
  /** Vị trí nhãn của sự kiện (vòng tròn). */
  labelPos?: "right" | "below";
  /** Sự kiện kết thúc: hoàn tất (xanh) hay kết thúc bất thường (đỏ). */
  endTone?: "success" | "danger";
  // ——— Thuộc tính tác vụ người dùng ———
  group?: string;
  sla?: string;
  form?: string;
  decisions?: TaskDecision[];
  // ——— Tác vụ dịch vụ ———
  service?: string;
};

export type BpmnEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  /** Các điểm gấp (đã gồm điểm đầu và cuối). */
  points: Array<[number, number]>;
  labelAt?: [number, number];
  /** Nhánh ra từ cổng rẽ nhánh — có gửi thông báo cho người nộp không. */
  notifySubmitter?: boolean;
};

export type ProcessModel = { nodes: BpmnNode[]; edges: BpmnEdge[] };

export type ProcessDef = {
  id: string;
  key: string;
  name: string;
  version: number;
  status: "running" | "draft";
  /** Ghi chú dưới tên ("23 hồ sơ"). */
  note?: string;
  model: ProcessModel;
};

export type Issue = { level: "error" | "warning"; message: string; nodeId?: string };

export type FormDef = { id: string; name: string; fields: Array<{ label: string; type: string; required?: boolean }> };
