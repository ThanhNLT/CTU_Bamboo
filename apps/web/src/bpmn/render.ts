/* eslint-disable @typescript-eslint/no-explicit-any */
// Vẽ phần tử BPMN bằng SVG (ADR #81). Phần tử đầu tiên trong nhóm vẽ luôn là hình chính để CSS tô trạng thái
// (`.marker .djs-visual > :nth-child(1)`) dùng được cho mọi loại.
import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { append, attr, create } from "tiny-svg";

import { boOf, eventDefinition, is, isAny, isExpanded, kindOf, type Bo, type DiagramElement } from "./model";

export const COLORS = { stroke: "#22242a", fill: "#ffffff", text: "#22242a", muted: "#6b7280" };
export const FONT = { family: "Arial, Helvetica, sans-serif", size: 12, lineHeight: 14 };

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

let measureCtx: CanvasRenderingContext2D | null | undefined;
const textWidth = (text: string) => {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      measureCtx = null;
    }
    if (measureCtx) measureCtx.font = `${FONT.size}px ${FONT.family}`;
  }
  return measureCtx ? measureCtx.measureText(text).width : text.length * FONT.size * 0.55;
};

/** Chia nhãn thành các dòng vừa `width`; từ quá dài thì cắt theo ký tự. */
export const wrapText = (text: string, width: number, maxLines = 8): string[] => {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (textWidth(line) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut)) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.$/, "")}…`;
  }
  return lines;
};

/** Khung nhãn ngoài hình (sự kiện, cổng, luồng): giữa theo `center.x`, bắt đầu từ `top`. */
export const externalLabelBox = (text: string, center: Point, top: number): Box => {
  const lines = wrapText(text, 90, 4);
  const width = Math.max(...lines.map(textWidth), 10);
  return { x: center.x - width / 2, y: top, width, height: lines.length * FONT.lineHeight };
};

const svg = (parent: SVGElement, tag: string, attrs: Record<string, string | number>) => {
  const el = create(tag);
  attr(el, attrs);
  append(parent, el);
  return el;
};

const lineStyle = (width = 2, fill = COLORS.fill, extra: Record<string, string | number> = {}) => ({
  stroke: COLORS.stroke,
  "stroke-width": width,
  fill,
  ...extra,
});

const text = (parent: SVGElement, lines: string[], x: number, y: number, anchor: "middle" | "start" = "middle") => {
  if (!lines.length) return;
  const el = svg(parent, "text", {
    class: "bamboo-label",
    "font-family": FONT.family,
    "font-size": FONT.size,
    fill: COLORS.text,
    "text-anchor": anchor,
  });
  lines.forEach((line, i) => {
    const span = create("tspan");
    attr(span, { x, y: y + (i + 1) * FONT.lineHeight - 3 });
    span.textContent = line;
    append(el, span);
  });
};

// ---- biểu tượng ----------------------------------------------------------------------------------------------

const userIcon = (g: SVGElement) => {
  svg(g, "circle", { cx: 15, cy: 12, r: 4, ...lineStyle(1.5) });
  svg(g, "path", { d: "M7,25 C7,18 23,18 23,25 Z", ...lineStyle(1.5) });
};

const gearIcon = (g: SVGElement) => {
  const cx = 15,
    cy = 15;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    svg(g, "line", {
      x1: cx + Math.cos(a) * 4,
      y1: cy + Math.sin(a) * 4,
      x2: cx + Math.cos(a) * 8,
      y2: cy + Math.sin(a) * 8,
      stroke: COLORS.stroke,
      "stroke-width": 3,
      "stroke-linecap": "round",
    });
  }
  svg(g, "circle", { cx, cy, r: 5.5, ...lineStyle(1.5) });
  svg(g, "circle", { cx, cy, r: 2, ...lineStyle(1.5) });
};

const scriptIcon = (g: SVGElement) => {
  svg(g, "path", { d: "M9,7 H21 C17,11 23,15 19,19 H7 C11,15 5,11 9,7 Z", ...lineStyle(1.5) });
  for (const y of [10.5, 13.5, 16.5]) svg(g, "line", { x1: 10, y1: y, x2: 18, y2: y, stroke: COLORS.stroke });
};

const envelope = (g: SVGElement, x: number, y: number, w: number, h: number, filled: boolean) => {
  const fill = filled ? COLORS.stroke : COLORS.fill;
  const stroke = filled ? COLORS.fill : COLORS.stroke;
  svg(g, "rect", { x, y, width: w, height: h, fill, stroke: COLORS.stroke, "stroke-width": 1.5 });
  svg(g, "path", {
    d: `M${x},${y} L${x + w / 2},${y + h * 0.55} L${x + w},${y}`,
    fill: "none",
    stroke,
    "stroke-width": 1.5,
  });
};

const tableIcon = (g: SVGElement) => {
  svg(g, "rect", { x: 7, y: 8, width: 18, height: 13, ...lineStyle(1.5) });
  svg(g, "rect", { x: 7, y: 8, width: 18, height: 4, fill: COLORS.stroke, stroke: COLORS.stroke });
  svg(g, "line", { x1: 12, y1: 12, x2: 12, y2: 21, stroke: COLORS.stroke });
  svg(g, "line", { x1: 7, y1: 16.5, x2: 25, y2: 16.5, stroke: COLORS.stroke });
};

const handIcon = (g: SVGElement) => {
  svg(g, "path", {
    d: "M8,22 V13 C8,11 11,11 11,13 V9 C11,7 14,7 14,9 V8 C14,6 17,6 17,8 V10 C17,8 20,8 20,10 V18 C20,21 18,23 15,23 H11 Z",
    ...lineStyle(1.3),
  });
};

const loopMarker = (g: SVGElement, bo: Bo, box: Box) => {
  const loop = bo.loopCharacteristics;
  if (!loop) return;
  const cx = box.width / 2,
    y = box.height - 18;
  if (is(loop, "bpmn:MultiInstanceLoopCharacteristics")) {
    for (let i = -1; i <= 1; i++) {
      if (loop.isSequential)
        svg(g, "line", {
          x1: cx - 6,
          y1: y + 6 + i * 4,
          x2: cx + 6,
          y2: y + 6 + i * 4,
          stroke: COLORS.stroke,
          "stroke-width": 2,
        });
      else
        svg(g, "line", { x1: cx + i * 4, y1: y, x2: cx + i * 4, y2: y + 12, stroke: COLORS.stroke, "stroke-width": 2 });
    }
  } else {
    svg(g, "path", { d: `M${cx - 4},${y + 11} A6,6 0 1 1 ${cx + 4},${y + 11}`, ...lineStyle(1.5, "none") });
    svg(g, "path", { d: `M${cx + 4},${y + 7} L${cx + 4},${y + 11} L${cx + 8},${y + 11}`, ...lineStyle(1.5, "none") });
  }
};

const eventIcon = (g: SVGElement, def: string | undefined, throwing: boolean) => {
  const c = 18;
  const fill = throwing ? COLORS.stroke : COLORS.fill;
  switch (def) {
    case "TimerEventDefinition": {
      svg(g, "circle", { cx: c, cy: c, r: 10.5, ...lineStyle(1.5) });
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        svg(g, "line", {
          x1: c + Math.cos(a) * 8,
          y1: c + Math.sin(a) * 8,
          x2: c + Math.cos(a) * 10,
          y2: c + Math.sin(a) * 10,
          stroke: COLORS.stroke,
        });
      }
      svg(g, "path", { d: `M${c},${c - 7} L${c},${c} L${c + 5},${c + 3}`, ...lineStyle(1.5, "none") });
      return;
    }
    case "MessageEventDefinition":
      return envelope(g, c - 9, c - 6.5, 18, 13, throwing);
    case "SignalEventDefinition":
      svg(g, "path", { d: `M${c},${c - 10} L${c + 9},${c + 6} L${c - 9},${c + 6} Z`, ...lineStyle(1.5, fill) });
      return;
    case "ErrorEventDefinition":
      svg(g, "path", {
        d: `M${c - 9},${c + 9} L${c - 4},${c - 8} L${c + 2},${c + 2} L${c + 9},${c - 9} L${c + 4},${c + 8} L${c - 2},${c - 2} Z`,
        ...lineStyle(1.5, fill),
      });
      return;
    case "EscalationEventDefinition":
      svg(g, "path", {
        d: `M${c},${c - 10} L${c + 7},${c + 9} L${c},${c + 3} L${c - 7},${c + 9} Z`,
        ...lineStyle(1.5, fill),
      });
      return;
    case "ConditionalEventDefinition":
      svg(g, "rect", { x: c - 7, y: c - 9, width: 14, height: 18, ...lineStyle(1.5) });
      for (const y of [-5, -1, 3, 7])
        svg(g, "line", { x1: c - 4, y1: c + y, x2: c + 4, y2: c + y, stroke: COLORS.stroke });
      return;
    case "TerminateEventDefinition":
      svg(g, "circle", { cx: c, cy: c, r: 10, fill: COLORS.stroke, stroke: COLORS.stroke });
      return;
    case "LinkEventDefinition":
      svg(g, "path", {
        d: `M${c - 9},${c - 3} H${c + 1} V${c - 8} L${c + 9},${c} L${c + 1},${c + 8} V${c + 3} H${c - 9} Z`,
        ...lineStyle(1.5, fill),
      });
      return;
    case "CompensateEventDefinition":
      svg(g, "path", {
        d: `M${c - 10},${c} L${c - 1},${c - 7} V${c + 7} Z M${c - 1},${c} L${c + 8},${c - 7} V${c + 7} Z`,
        ...lineStyle(1.5, fill),
      });
      return;
    case "CancelEventDefinition":
      svg(g, "path", {
        d: `M${c - 7},${c - 7} L${c + 7},${c + 7} M${c + 7},${c - 7} L${c - 7},${c + 7}`,
        ...lineStyle(4, "none"),
      });
      return;
  }
};

// ---- hình ----------------------------------------------------------------------------------------------------

const drawEvent = (g: SVGElement, bo: Bo) => {
  const end = is(bo, "bpmn:EndEvent");
  const intermediate = isAny(bo, ["bpmn:IntermediateCatchEvent", "bpmn:IntermediateThrowEvent", "bpmn:BoundaryEvent"]);
  const dashed =
    (is(bo, "bpmn:StartEvent") && bo.isInterrupting === false) ||
    (is(bo, "bpmn:BoundaryEvent") && bo.cancelActivity === false);
  const dash: Record<string, string> = dashed ? { "stroke-dasharray": "5.5 3" } : {};
  const main = svg(g, "circle", {
    cx: 18,
    cy: 18,
    r: 18,
    ...lineStyle(end ? 4 : intermediate ? 1.5 : 2, COLORS.fill, dash),
  });
  if (intermediate) svg(g, "circle", { cx: 18, cy: 18, r: 15, ...lineStyle(1.5, "none", dash) });
  eventIcon(g, eventDefinition(bo), end || is(bo, "bpmn:IntermediateThrowEvent"));
  return main;
};

const drawGateway = (g: SVGElement, bo: Bo, box: Box) => {
  const w = box.width,
    h = box.height,
    cx = w / 2,
    cy = h / 2;
  const main = svg(g, "polygon", { points: `${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`, ...lineStyle(2) });
  const s = Math.min(w, h) / 50;
  if (is(bo, "bpmn:ExclusiveGateway"))
    svg(g, "path", {
      d: `M${cx - 8 * s},${cy - 8 * s} L${cx + 8 * s},${cy + 8 * s} M${cx + 8 * s},${cy - 8 * s} L${cx - 8 * s},${cy + 8 * s}`,
      ...lineStyle(4, "none"),
    });
  else if (is(bo, "bpmn:ParallelGateway"))
    svg(g, "path", {
      d: `M${cx},${cy - 11 * s} V${cy + 11 * s} M${cx - 11 * s},${cy} H${cx + 11 * s}`,
      ...lineStyle(4, "none"),
    });
  else if (is(bo, "bpmn:InclusiveGateway")) svg(g, "circle", { cx, cy, r: 11 * s, ...lineStyle(2.5, "none") });
  else if (is(bo, "bpmn:ComplexGateway"))
    svg(g, "path", {
      d: `M${cx},${cy - 11 * s} V${cy + 11 * s} M${cx - 11 * s},${cy} H${cx + 11 * s} M${cx - 8 * s},${cy - 8 * s} L${cx + 8 * s},${cy + 8 * s} M${cx + 8 * s},${cy - 8 * s} L${cx - 8 * s},${cy + 8 * s}`,
      ...lineStyle(3, "none"),
    });
  else if (is(bo, "bpmn:EventBasedGateway")) {
    svg(g, "circle", { cx, cy, r: 12 * s, ...lineStyle(1.2, "none") });
    svg(g, "circle", { cx, cy, r: 9.5 * s, ...lineStyle(1.2, "none") });
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return `${cx + Math.cos(a) * 6 * s},${cy + Math.sin(a) * 6 * s}`;
    }).join(" ");
    svg(g, "polygon", { points: pts, ...lineStyle(1.4, "none") });
  }
  return main;
};

const drawActivity = (g: SVGElement, element: DiagramElement, bo: Bo, box: Box) => {
  const expanded = isExpanded(element);
  const main = svg(g, "rect", {
    x: 0,
    y: 0,
    width: box.width,
    height: box.height,
    rx: 10,
    ry: 10,
    ...lineStyle(is(bo, "bpmn:CallActivity") ? 5 : 2, expanded ? "rgba(255,255,255,0.6)" : COLORS.fill),
  });
  if (is(bo, "bpmn:UserTask")) userIcon(g);
  else if (isAny(bo, ["bpmn:ServiceTask"])) gearIcon(g);
  else if (is(bo, "bpmn:ScriptTask")) scriptIcon(g);
  else if (is(bo, "bpmn:SendTask")) envelope(g, 7, 9, 18, 12, true);
  else if (is(bo, "bpmn:ReceiveTask")) envelope(g, 7, 9, 18, 12, false);
  else if (is(bo, "bpmn:BusinessRuleTask")) tableIcon(g);
  else if (is(bo, "bpmn:ManualTask")) handIcon(g);
  const name = bo.name ?? "";
  if (expanded) {
    text(g, wrapText(name, box.width - 20, 2), 10, 4, "start");
  } else {
    const lines = wrapText(name, box.width - 12, Math.max(1, Math.floor((box.height - 10) / FONT.lineHeight)));
    text(g, lines, box.width / 2, (box.height - lines.length * FONT.lineHeight) / 2);
  }
  if (is(bo, "bpmn:SubProcess") && !expanded) {
    const x = box.width / 2 - 7,
      y = box.height - 18;
    svg(g, "rect", { x, y, width: 14, height: 14, ...lineStyle(1.5) });
    svg(g, "path", { d: `M${x + 3},${y + 7} H${x + 11} M${x + 7},${y + 3} V${y + 11}`, ...lineStyle(1.5, "none") });
  } else loopMarker(g, bo, box);
  return main;
};

// ---- luồng ---------------------------------------------------------------------------------------------------

export const connectionPath = (waypoints: Point[]) =>
  waypoints.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

export const longestSegmentMid = (waypoints: Point[]): Point => {
  let best = { len: -1, mid: waypoints[0] ?? { x: 0, y: 0 } };
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1],
      b = waypoints[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return best.mid;
};

/** Khung nhãn của luồng: phía trên trung điểm đoạn dài nhất. */
export const flowLabelBox = (name: string, waypoints: Point[]): Box => {
  const mid = longestSegmentMid(waypoints);
  const box = externalLabelBox(name, mid, 0);
  return { ...box, y: mid.y - box.height - 4 };
};

/** Khung nhãn của sự kiện, cổng: dưới hình. */
export const shapeLabelBox = (name: string, shape: Box): Box =>
  externalLabelBox(name, { x: shape.x + shape.width / 2, y: 0 }, shape.y + shape.height + 5);

/** Vị trí nhãn lưu trong tệp (BPMNLabel) lúc nhập: nhãn đi theo hình hoặc theo đoạn dài nhất của luồng. */
export type LabelHint = { dx: number; dy: number; width: number };

const placed = (name: string, x: number, y: number, width: number): Box => {
  const box = externalLabelBox(name, { x: x + width / 2, y: 0 }, y);
  return box;
};

/** Khung nhãn (tọa độ sơ đồ) của sự kiện, cổng. */
export const shapeLabel = (element: DiagramElement, name = boOf(element)?.name ?? ""): Box => {
  const hint: LabelHint | undefined = element.labelHint;
  return hint ? placed(name, element.x + hint.dx, element.y + hint.dy, hint.width) : shapeLabelBox(name, element);
};

/** Khung nhãn (tọa độ sơ đồ) của luồng. */
export const flowLabel = (connection: DiagramElement, name = boOf(connection)?.name ?? ""): Box => {
  const hint: LabelHint | undefined = connection.labelHint;
  const wps: Point[] = connection.waypoints ?? [];
  if (!hint) return flowLabelBox(name, wps);
  const mid = longestSegmentMid(wps);
  return placed(name, mid.x + hint.dx, mid.y + hint.dy, hint.width);
};

const drawFlow = (g: SVGElement, connection: DiagramElement) => {
  const bo = boOf(connection);
  const wps: Point[] = connection.waypoints ?? [];
  const main = svg(g, "path", {
    d: connectionPath(wps),
    fill: "none",
    stroke: COLORS.stroke,
    "stroke-width": 1.5,
    "stroke-linejoin": "round",
  });
  if (wps.length < 2) return main;
  const end = wps[wps.length - 1],
    prev = wps[wps.length - 2];
  const a = Math.atan2(end.y - prev.y, end.x - prev.x);
  const tip = (dx: number, dy: number) =>
    `${end.x + dx * Math.cos(a) - dy * Math.sin(a)},${end.y + dx * Math.sin(a) + dy * Math.cos(a)}`;
  svg(g, "polygon", {
    points: `${tip(0, 0)} ${tip(-11, -4)} ${tip(-11, 4)}`,
    fill: COLORS.stroke,
    stroke: COLORS.stroke,
    class: "bamboo-arrow",
  });

  const start = wps[0],
    next = wps[1];
  const b = Math.atan2(next.y - start.y, next.x - start.x);
  const at = (d: number, side: number) => ({
    x: start.x + d * Math.cos(b) - side * Math.sin(b),
    y: start.y + d * Math.sin(b) + side * Math.cos(b),
  });
  const pts = (...ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
  const source = boOf(connection.source);
  if (source?.default && source.default === bo) {
    const p = at(6, -5),
      q = at(12, 5);
    svg(g, "line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: COLORS.stroke, "stroke-width": 1.5 });
  } else if (bo?.conditionExpression && source && !is(source, "bpmn:Gateway")) {
    svg(g, "polygon", { points: pts(at(0, 0), at(8, -5), at(16, 0), at(8, 5)), ...lineStyle(1.5) });
  }
  if (bo?.name) {
    const box = flowLabel(connection);
    text(g, wrapText(bo.name, 90, 4), box.x + box.width / 2, box.y);
  }
  return main;
};

// ---- đường bao (để cắt đường nối ở mép hình) ----------------------------------------------------------------

const rectPath = (s: Box) => `M${s.x},${s.y} h${s.width} v${s.height} h${-s.width} Z`;
const circlePath = (s: Box) => {
  const r = s.width / 2,
    cx = s.x + r,
    cy = s.y + s.height / 2;
  return `M${cx},${cy - r} a${r},${r} 0 1,1 0,${2 * r} a${r},${r} 0 1,1 0,${-2 * r} Z`;
};
const diamondPath = (s: Box) =>
  `M${s.x + s.width / 2},${s.y} L${s.x + s.width},${s.y + s.height / 2} L${s.x + s.width / 2},${s.y + s.height} L${s.x},${s.y + s.height / 2} Z`;

export class BambooRenderer extends BaseRenderer {
  static $inject = ["eventBus"];

  constructor(eventBus: any) {
    super(eventBus, 1500);
  }

  canRender() {
    return true;
  }

  drawShape(parent: SVGElement, element: DiagramElement) {
    const bo = boOf(element);
    const box = { x: element.x, y: element.y, width: element.width, height: element.height };
    const kind = kindOf(bo);
    if (kind === "event" || kind === "gateway") {
      const main = kind === "event" ? drawEvent(parent, bo) : drawGateway(parent, bo, box);
      if (bo.name) {
        const label = shapeLabel(element);
        text(parent, wrapText(bo.name, 90, 4), label.x - box.x + label.width / 2, label.y - box.y);
      }
      return main;
    }
    if (kind === "task" || kind === "subprocess") return drawActivity(parent, element, bo, box);
    return svg(parent, "rect", {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
      ...lineStyle(1, "none", { "stroke-dasharray": "4 2" }),
    });
  }

  drawConnection(parent: SVGElement, connection: DiagramElement) {
    return drawFlow(parent, connection);
  }

  getShapePath(shape: DiagramElement) {
    const kind = kindOf(boOf(shape));
    if (kind === "event") return circlePath(shape);
    if (kind === "gateway") return diamondPath(shape);
    return rectPath(shape);
  }

  getConnectionPath(connection: DiagramElement) {
    return connectionPath(connection.waypoints ?? []);
  }
}
