/* eslint-disable @typescript-eslint/no-explicit-any */
// Mô hình BPMN của Bamboo (ADR #81): đọc, ghi XML bằng bpmn-moddle (MIT), phân loại phần tử và kích thước mặc định.
import { BpmnModdle } from "bpmn-moddle";

export type Bo = any;
export type DiagramElement = any;

export const createModdle = (extensions: Record<string, unknown> = {}) => new BpmnModdle(extensions as any);

/** `bpmn:UserTask` có phải (hoặc kế thừa) `bpmn:Task`… */
export const is = (bo: Bo, type: string): boolean =>
  !!bo && typeof bo.$instanceOf === "function" && bo.$instanceOf(type);

export const isAny = (bo: Bo, types: string[]) => types.some((t) => is(bo, t));

export const boOf = (element: DiagramElement): Bo => element?.businessObject ?? element;

export type Kind = "event" | "task" | "gateway" | "subprocess" | "flow" | "other";

export const kindOf = (bo: Bo): Kind => {
  if (is(bo, "bpmn:SequenceFlow")) return "flow";
  if (is(bo, "bpmn:Event")) return "event";
  if (is(bo, "bpmn:Gateway")) return "gateway";
  if (is(bo, "bpmn:SubProcess")) return "subprocess";
  if (isAny(bo, ["bpmn:Task", "bpmn:CallActivity"])) return "task";
  return "other";
};

/** Phần tử Bamboo vẽ được; phần còn lại của tệp (làn, ghi chú, dữ liệu…) được giữ nguyên khi lưu. */
export const isDrawable = (bo: Bo) => kindOf(bo) !== "other";

export const isExpanded = (element: DiagramElement) => {
  const di = element?.di;
  return is(boOf(element), "bpmn:SubProcess") && !!di && di.isExpanded !== false && di.isExpanded !== undefined;
};

export const SIZES: Record<string, { width: number; height: number }> = {
  event: { width: 36, height: 36 },
  gateway: { width: 50, height: 50 },
  task: { width: 100, height: 80 },
  subprocess: { width: 100, height: 80 },
  expanded: { width: 350, height: 200 },
};

export const sizeOf = (bo: Bo, expanded = false) => {
  const kind = kindOf(bo);
  if (kind === "subprocess" && expanded) return SIZES.expanded;
  return SIZES[kind] ?? SIZES.task;
};

const PREFIX: Record<Kind, string> = {
  event: "Event",
  task: "Activity",
  gateway: "Gateway",
  subprocess: "Activity",
  flow: "Flow",
  other: "Element",
};

/** Mã phần tử mới, không trùng với mã đã có trong tệp. */
export class Ids {
  private used = new Set<string>();

  reset(ids: Iterable<string>) {
    this.used = new Set(ids);
  }

  claim(id: string) {
    this.used.add(id);
  }

  next(bo: Bo): string {
    const kind = kindOf(bo);
    for (;;) {
      const id = `${PREFIX[kind]}_${Math.random().toString(36).slice(2, 9)}`;
      if (!this.used.has(id)) {
        this.used.add(id);
        return id;
      }
    }
  }
}

export const eventDefinition = (bo: Bo): string | undefined => {
  const def = bo?.eventDefinitions?.[0];
  return def ? String(def.$type).replace("bpmn:", "") : undefined;
};
