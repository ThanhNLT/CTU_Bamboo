/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// Nhập sơ đồ từ XML BPMN 2.0 vào diagram-js và ghi ngược lại (ADR #81). Chỉ phần tử vẽ được (sự kiện, tác vụ, cổng,
// quy trình con, luồng tuần tự) đi qua diagram-js; mọi thứ khác trong tệp được giữ nguyên khi ghi.
import { boOf, is, isDrawable, kindOf, type Bo, type DiagramElement } from "./model";
import { flowLabel, longestSegmentMid, shapeLabel } from "./render";

export type ImportResult = { warnings: string[] };

/** Trạng thái tài liệu đang mở: definitions gốc và các phần tử đã từng có trên sơ đồ (để biết phần tử nào bị xóa). */
export class DocumentState {
  definitions: Bo = null;
  plane: Bo = null;
  process: Bo = null;
  tracked = new Set<Bo>();
}

const round = (n: number) => Math.round(n);

const containerShape = (bo: Bo, shapes: Map<Bo, DiagramElement>, root: DiagramElement) => {
  for (let p = bo.$parent; p; p = p.$parent) {
    const shape = shapes.get(p);
    if (shape && is(p, "bpmn:SubProcess") && !shape.collapsed) return shape;
  }
  return root;
};

/** Con của quy trình con thu gọn nằm cùng mặt phẳng: không vẽ (giữ nguyên trong tệp). */
const insideCollapsed = (bo: Bo, shapes: Map<Bo, DiagramElement>) => {
  for (let p = bo.$parent; p; p = p.$parent) if (shapes.get(p)?.collapsed) return true;
  return false;
};

const depth = (bo: Bo) => {
  let d = 0;
  for (let p = bo.$parent; p; p = p.$parent) d++;
  return d;
};

export const importXml = async (injector: any, state: DocumentState, xml: string): Promise<ImportResult> => {
  const moddle = injector.get("moddle");
  const canvas = injector.get("canvas");
  const elementFactory = injector.get("elementFactory");
  const ids = injector.get("bambooIds");

  const { rootElement: definitions, warnings, elementsById } = await moddle.fromXML(xml, "bpmn:Definitions");
  const plane = definitions.diagrams?.[0]?.plane;
  if (!plane) throw new Error("tệp không có phần sơ đồ (BPMNDiagram)");
  let process = plane.bpmnElement;
  if (!process || !is(process, "bpmn:Process")) {
    process =
      (is(process, "bpmn:Collaboration") && process.participants?.find((p: Bo) => p.processRef)?.processRef) ||
      definitions.rootElements?.find((e: Bo) => is(e, "bpmn:Process"));
  }
  if (!process) throw new Error("tệp không có quy trình (process)");

  ids.reset(Object.keys(elementsById ?? {}));
  state.definitions = definitions;
  state.plane = plane;
  state.process = process;
  state.tracked = new Set();

  const root = elementFactory.createRoot({
    id: `__root_${process.id}`,
    businessObject: process,
    type: process.$type,
    di: plane,
  });
  canvas.setRootElement(root);

  const shapeDis = (plane.planeElement ?? []).filter(
    (di: Bo) => is(di, "bpmndi:BPMNShape") && di.bpmnElement && isDrawable(di.bpmnElement) && di.bounds,
  );
  // cha (quy trình con mở rộng) trước con, sự kiện biên sau tác vụ chứa nó
  shapeDis.sort(
    (a: Bo, b: Bo) =>
      depth(a.bpmnElement) - depth(b.bpmnElement) ||
      Number(is(a.bpmnElement, "bpmn:BoundaryEvent")) - Number(is(b.bpmnElement, "bpmn:BoundaryEvent")),
  );
  const shapes = new Map<Bo, DiagramElement>();
  for (const di of shapeDis) {
    const bo = di.bpmnElement;
    if (shapes.has(bo) || insideCollapsed(bo, shapes)) continue;
    const collapsed = is(bo, "bpmn:SubProcess") && !di.isExpanded;
    const shape = elementFactory.createShape({
      id: bo.id,
      type: bo.$type,
      businessObject: bo,
      di,
      collapsed,
      x: round(di.bounds.x),
      y: round(di.bounds.y),
      width: round(di.bounds.width),
      height: round(di.bounds.height),
    });
    const lb = di.label?.bounds;
    if (lb && kindOf(bo) !== "task" && kindOf(bo) !== "subprocess")
      shape.labelHint = { dx: lb.x - shape.x, dy: lb.y - shape.y, width: lb.width };
    if (is(bo, "bpmn:BoundaryEvent")) {
      const host = shapes.get(bo.attachedToRef);
      if (!host) {
        warnings.push(`sự kiện biên ${bo.id} không có tác vụ chứa trên sơ đồ`);
        continue;
      }
      shape.host = host;
    }
    canvas.addShape(shape, containerShape(bo, shapes, root));
    shapes.set(bo, shape);
    state.tracked.add(bo);
  }

  for (const di of plane.planeElement ?? []) {
    const bo = di.bpmnElement;
    if (!is(di, "bpmndi:BPMNEdge") || !is(bo, "bpmn:SequenceFlow")) continue;
    const source = shapes.get(bo.sourceRef);
    const target = shapes.get(bo.targetRef);
    if (insideCollapsed(bo, shapes)) continue;
    if (!source || !target) {
      warnings.push(`luồng ${bo.id} thiếu phần tử nguồn hoặc đích trên sơ đồ`);
      continue;
    }
    const waypoints = (di.waypoint ?? []).map((p: Bo) => ({ x: round(p.x), y: round(p.y) }));
    const connection = elementFactory.createConnection({
      id: bo.id,
      type: bo.$type,
      businessObject: bo,
      di,
      source,
      target,
      waypoints:
        waypoints.length >= 2
          ? waypoints
          : [
              { x: source.x + source.width / 2, y: source.y + source.height / 2 },
              { x: target.x + target.width / 2, y: target.y + target.height / 2 },
            ],
    });
    const lb = di.label?.bounds;
    if (lb) {
      const mid = longestSegmentMid(connection.waypoints);
      connection.labelHint = { dx: lb.x - mid.x, dy: lb.y - mid.y, width: lb.width };
    }
    canvas.addConnection(connection, containerShape(bo, shapes, root));
    state.tracked.add(bo);
  }

  return { warnings: warnings.map((w: any) => (typeof w === "string" ? w : String(w?.message ?? w))) };
};

const remove = (list: Bo[] | undefined, item: Bo) => {
  if (!list) return;
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
};

const labelFor = (moddle: any, box: { x: number; y: number; width: number; height: number }) =>
  moddle.create("bpmndi:BPMNLabel", {
    bounds: moddle.create("dc:Bounds", {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
    }),
  });

/** Đồng bộ sơ đồ về definitions rồi ghi XML. */
export const exportXml = async (injector: any, state: DocumentState, format: boolean): Promise<string> => {
  if (!state.definitions) throw new Error("chưa có sơ đồ");
  const moddle = injector.get("moddle");
  const registry = injector.get("elementRegistry");
  const canvas = injector.get("canvas");
  const root = canvas.getRootElement();
  const elements: DiagramElement[] = registry.filter((e: DiagramElement) => e !== root && e.businessObject);
  const present = new Set(elements.map(boOf));
  const plane = state.plane;
  plane.planeElement = plane.planeElement ?? [];

  // phần tử đã xóa khỏi sơ đồ
  for (const bo of state.tracked) {
    if (present.has(bo)) continue;
    remove(bo.$parent?.flowElements, bo);
    if (bo.di) remove(plane.planeElement, bo.di);
    for (const di of [...plane.planeElement]) if (di.bpmnElement === bo) remove(plane.planeElement, di);
  }

  for (const element of elements) {
    const bo = boOf(element);
    state.tracked.add(bo);
    const parent = element.parent && element.parent !== root ? boOf(element.parent) : state.process;
    if (bo.$parent !== parent) {
      remove(bo.$parent?.flowElements, bo);
      bo.$parent = parent;
    }
    parent.flowElements = parent.flowElements ?? [];
    if (!parent.flowElements.includes(bo)) parent.flowElements.push(bo);
    const di = element.di;
    if (di) {
      if (!plane.planeElement.includes(di)) plane.planeElement.push(di);
      di.$parent = plane;
      di.bpmnElement = bo;
    }
  }

  const connections = elements.filter((e) => e.waypoints);
  const nodes = elements.filter((e) => !e.waypoints);
  for (const node of nodes) {
    const bo = boOf(node);
    const di = node.di;
    di.bounds = moddle.create("dc:Bounds", {
      x: round(node.x),
      y: round(node.y),
      width: round(node.width),
      height: round(node.height),
    });
    const kind = kindOf(bo);
    if ((kind === "event" || kind === "gateway") && bo.name) di.label = labelFor(moddle, shapeLabel(node));
    else delete di.label;
    if (is(bo, "bpmn:SubProcess")) di.isExpanded = !node.collapsed;
    if (is(bo, "bpmn:BoundaryEvent")) bo.attachedToRef = node.host ? boOf(node.host) : bo.attachedToRef;
    if (kindOf(bo) !== "flow") {
      bo.incoming = connections.filter((c) => c.target === node).map(boOf);
      bo.outgoing = connections.filter((c) => c.source === node).map(boOf);
      if (bo.default && !present.has(bo.default)) bo.default = undefined;
    }
  }
  for (const connection of connections) {
    const bo = boOf(connection);
    bo.sourceRef = boOf(connection.source);
    bo.targetRef = boOf(connection.target);
    const di = connection.di;
    di.waypoint = connection.waypoints.map((p: { x: number; y: number }) =>
      moddle.create("dc:Point", { x: round(p.x), y: round(p.y) }),
    );
    if (bo.name) di.label = labelFor(moddle, flowLabel(connection));
    else delete di.label;
  }

  const { xml } = await moddle.toXML(state.definitions, { format });
  return xml;
};
