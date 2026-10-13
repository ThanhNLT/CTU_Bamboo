// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { NODE_TYPE_LABEL } from "./mock";
import type { BpmnNode, Issue, NodeType, ProcessDef, ProcessModel } from "./types";

/** "8 giờ làm việc" → "PT8H", "1 ngày" → "P1D", "30 phút" → "PT30M" (dạng Flowable hiểu). null nếu không đọc được. */
export const slaToIso = (sla?: string): string | null => {
  const m = sla?.trim().match(/^(\d+)\s*(phút|giờ|ngày|tuần)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === "phút" ? `PT${n}M` : unit === "giờ" ? `PT${n}H` : unit === "ngày" ? `P${n}D` : `P${n * 7}D`;
};

/** Kiểm tra mô hình: lỗi chặn chạy thử, cảnh báo thì không. */
export const validate = (model: ProcessModel): Issue[] => {
  const issues: Issue[] = [];
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  if (!model.nodes.some((n) => n.type === "start")) issues.push({ level: "error", message: "Thiếu sự kiện bắt đầu." });
  if (!model.nodes.some((n) => n.type === "end")) issues.push({ level: "error", message: "Thiếu sự kiện kết thúc." });

  for (const n of model.nodes) {
    const label = n.name.trim() || NODE_TYPE_LABEL[n.type];
    if (!n.name.trim())
      issues.push({ level: "error", message: `${NODE_TYPE_LABEL[n.type]} chưa có tên.`, nodeId: n.id });
    if (n.type === "userTask") {
      if (!n.group) issues.push({ level: "error", message: `“${label}” chưa chọn nhóm xử lý.`, nodeId: n.id });
      if (!n.sla?.trim()) issues.push({ level: "error", message: `“${label}” chưa đặt SLA.`, nodeId: n.id });
      else if (!slaToIso(n.sla))
        issues.push({
          level: "error",
          message: `SLA của “${label}” không đọc được — dùng dạng “8 giờ”, “1 ngày”.`,
          nodeId: n.id,
        });
      if (!n.decisions?.length)
        issues.push({ level: "error", message: `“${label}” chưa cho phép quyết định nào.`, nodeId: n.id });
    }
    const connected = model.edges.some((e) => e.from === n.id || e.to === n.id);
    if (!connected) issues.push({ level: "warning", message: `“${label}” chưa được nối vào luồng.`, nodeId: n.id });
  }

  for (const e of model.edges) {
    const from = byId.get(e.from);
    if (from?.type === "gateway" && e.label && e.notifySubmitter === false) {
      issues.push({
        level: "warning",
        message: `Nhánh “${e.label}” chưa gửi thông báo cho người nộp.`,
        nodeId: from.id,
      });
    }
  }
  return issues;
};

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TAG: Record<NodeType, string> = {
  start: "startEvent",
  userTask: "userTask",
  serviceTask: "serviceTask",
  gateway: "exclusiveGateway",
  end: "endEvent",
};

/** Xuất BPMN 2.0 (kèm thuộc tính Flowable) — phần logic, chưa gồm tọa độ sơ đồ (DI). */
export const toBpmnXml = (p: ProcessDef, model: ProcessModel) => {
  const el = (n: BpmnNode) => {
    const attrs = [`id="${esc(n.id)}"`, `name="${esc(n.name)}"`];
    if (n.type === "userTask") {
      if (n.group) attrs.push(`flowable:candidateGroups="${esc(n.group)}"`);
      if (n.form) attrs.push(`flowable:formKey="${esc(n.form)}"`);
      const due = slaToIso(n.sla);
      if (due) attrs.push(`flowable:dueDate="${due}"`);
    }
    if (n.type === "serviceTask" && n.service) attrs.push(`flowable:delegateExpression="\${${esc(n.service)}}"`);
    return `    <${TAG[n.type]} ${attrs.join(" ")} />`;
  };
  const flow = (e: ProcessModel["edges"][number]) =>
    `    <sequenceFlow id="${esc(e.id)}" sourceRef="${esc(e.from)}" targetRef="${esc(e.to)}"${e.label ? ` name="${esc(e.label)}"` : ""} />`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"`,
    `             xmlns:flowable="http://flowable.org/bpmn"`,
    `             targetNamespace="https://bamboo.local/processes">`,
    `  <process id="${esc(p.key)}" name="${esc(p.name)}" isExecutable="true">`,
    ...model.nodes.map(el),
    ...model.edges.map(flow),
    `  </process>`,
    `</definitions>`,
    ``,
  ].join("\n");
};

export const downloadText = (filename: string, text: string, type = "application/xml") => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

let seq = 0;
/** Phần tử mới khi kéo từ bảng thành phần vào canvas. */
export const newNode = (type: NodeType, x: number, y: number): BpmnNode => {
  seq += 1;
  const id = `${type}_${Date.now().toString(36)}${seq}`;
  const base: BpmnNode = { id, type, name: NODE_TYPE_LABEL[type], x, y };
  if (type === "userTask")
    return { ...base, name: "Bước duyệt mới", sla: "1 ngày", decisions: ["approve", "return", "reject"] };
  if (type === "start" || type === "end")
    return { ...base, labelPos: "right", endTone: type === "end" ? "success" : undefined };
  return base;
};
