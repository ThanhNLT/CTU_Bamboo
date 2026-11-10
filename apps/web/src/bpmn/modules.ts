/* eslint-disable @typescript-eslint/no-explicit-any */
// Các module diagram-js của trình thiết kế quy trình Bamboo (ADR #81): tạo phần tử kèm đối tượng BPMN, bố cục đường
// nối vuông góc, quy tắc nối, bảng công cụ, menu ngữ cảnh, sửa nhãn trực tiếp, cập nhật thuộc tính có hoàn tác.
import ElementFactoryBase from "diagram-js/lib/core/ElementFactory";
import BaseLayouter from "diagram-js/lib/layout/BaseLayouter";
import CroppingConnectionDocking from "diagram-js/lib/layout/CroppingConnectionDocking";
import { asTRBL, getMid } from "diagram-js/lib/layout/LayoutUtil";
import { connectRectangles, withoutRedundantPoints } from "diagram-js/lib/layout/ManhattanLayout";
import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";

import { boOf, is, isAny, isExpanded, kindOf, sizeOf, type DiagramElement } from "./model";
import { BambooRenderer, flowLabel, FONT, shapeLabel } from "./render";
import { tr } from "../i18n";

// ---- tạo phần tử ---------------------------------------------------------------------------------------------

export type ShapeSpec = { type: string; eventDefinition?: string; isExpanded?: boolean };

const ElementFactory: any = ElementFactoryBase;

class BambooElementFactory extends ElementFactory {
  static $inject = ["moddle", "bambooIds"];
  private moddle: any;
  private ids: any;

  constructor(moddle: any, ids: any) {
    super();
    this.moddle = moddle;
    this.ids = ids;
  }

  create(elementType: string, attrs: any = {}) {
    if (elementType === "shape" && !attrs.businessObject && attrs.type)
      return super.create("shape", this.flowNode(attrs));
    if (elementType === "connection" && !attrs.businessObject) return super.create("connection", this.flow(attrs));
    return super.create(elementType, attrs);
  }

  private flowNode(attrs: any) {
    const bo = this.moddle.create(attrs.type);
    bo.id = this.ids.next(bo);
    if (attrs.eventDefinition) bo.eventDefinitions = [this.moddle.create(`bpmn:${attrs.eventDefinition}`)];
    const size = sizeOf(bo, !!attrs.isExpanded);
    const di = this.moddle.create("bpmndi:BPMNShape", { id: `${bo.id}_di`, bpmnElement: bo });
    if (is(bo, "bpmn:SubProcess")) di.isExpanded = !!attrs.isExpanded;
    const { eventDefinition: _e, isExpanded: _x, ...rest } = attrs;
    void _e;
    void _x;
    return {
      ...size,
      ...rest,
      id: bo.id,
      type: bo.$type,
      businessObject: bo,
      di,
      collapsed: is(bo, "bpmn:SubProcess") && !attrs.isExpanded,
    };
  }

  private flow(attrs: any) {
    const bo = this.moddle.create("bpmn:SequenceFlow");
    bo.id = this.ids.next(bo);
    const di = this.moddle.create("bpmndi:BPMNEdge", { id: `${bo.id}_di`, bpmnElement: bo });
    return { ...attrs, id: bo.id, type: bo.$type, businessObject: bo, di };
  }
}

// ---- bố cục đường nối ------------------------------------------------------------------------------------------

class BambooLayouter extends BaseLayouter {
  static $inject = ["connectionDocking"];
  private docking: any;

  constructor(docking: any) {
    super();
    this.docking = docking;
  }

  layoutConnection(connection: any, hints: any = {}) {
    const source = hints.source ?? connection.source;
    const target = hints.target ?? connection.target;
    if (!source || !target) return super.layoutConnection(connection, hints);
    connection.labelHint = undefined; // đường nối vẽ lại thì nhãn về vị trí mặc định
    const start = getMid(source);
    const end = getMid(target);
    const s = boOf(source),
      t = boOf(target);
    const preferredLayouts = is(s, "bpmn:Gateway")
      ? ["v:h"]
      : is(t, "bpmn:Gateway")
        ? ["h:v"]
        : is(s, "bpmn:BoundaryEvent")
          ? ["v:h"]
          : ["h:h"];
    const raw = withoutRedundantPoints(
      connectRectangles(source, target, start, end, { preferredLayouts }) ?? [start, end],
    );
    return this.docking.getCroppedWaypoints({ waypoints: raw, source, target }, source, target).map((p: any) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));
  }
}

// ---- quy tắc ---------------------------------------------------------------------------------------------------

const isContainer = (element: DiagramElement) => !!element && (!element.parent || isExpanded(element));

const canConnect = (source: DiagramElement, target: DiagramElement) => {
  if (!source || !target || source === target || source.waypoints || target.waypoints) return false;
  if (!source.parent || !target.parent) return false;
  const s = boOf(source),
    t = boOf(target);
  if (kindOf(s) === "other" || kindOf(t) === "other") return false;
  if (is(s, "bpmn:EndEvent") || is(t, "bpmn:StartEvent") || is(t, "bpmn:BoundaryEvent")) return false;
  if (source.outgoing?.some((c: DiagramElement) => c.target === target)) return false;
  return { type: "bpmn:SequenceFlow" };
};

class BambooRules extends RuleProvider {
  static $inject = ["eventBus"];

  init() {
    this.addRule("connection.start", (ctx: any) => {
      const s = boOf(ctx.source);
      return !!ctx.source?.parent && !ctx.source.waypoints && !is(s, "bpmn:EndEvent");
    });
    this.addRule("connection.create", (ctx: any) => canConnect(ctx.source, ctx.target));
    this.addRule("connection.reconnect", (ctx: any) => {
      const others = (ctx.source?.outgoing ?? []).filter((c: DiagramElement) => c !== ctx.connection);
      if (others.some((c: DiagramElement) => c.target === ctx.target)) return false;
      const ok = canConnect(ctx.source, ctx.target);
      return ok === false ? false : true;
    });
    this.addRule("shape.create", (ctx: any) => isContainer(ctx.target) && !is(boOf(ctx.shape), "bpmn:BoundaryEvent"));
    this.addRule("elements.create", (ctx: any) => isContainer(ctx.target));
    this.addRule("elements.move", (ctx: any) => {
      const shapes: DiagramElement[] = ctx.shapes ?? [];
      if (shapes.some((s) => is(boOf(s), "bpmn:BoundaryEvent") && !shapes.includes(s.host))) return false;
      if (!ctx.target) return true;
      if (!isContainer(ctx.target) || shapes.includes(ctx.target)) return false;
      return true;
    });
    this.addRule("shape.resize", (ctx: any) => {
      const bo = boOf(ctx.shape);
      if (!isAny(bo, ["bpmn:Activity"])) return false;
      const b = ctx.newBounds;
      return !b || (b.width >= 60 && b.height >= 40);
    });
    this.addRule("elements.delete", () => true);
  }
}

// ---- tự đặt vị trí khi nối thêm --------------------------------------------------------------------------------

class BambooAutoPlace {
  static $inject = ["eventBus", "elementRegistry"];

  constructor(eventBus: any, registry: any) {
    eventBus.on("autoPlace", 1500, ({ source, shape }: any) => {
      const trbl = asTRBL(source);
      const mid = getMid(source);
      const x = trbl.right + 60 + shape.width / 2;
      let y = mid.y;
      const overlaps = (cy: number) =>
        registry.filter(
          (e: DiagramElement) =>
            !e.waypoints &&
            e.parent &&
            e !== source &&
            e.parent === source.parent &&
            x + shape.width / 2 > e.x &&
            x - shape.width / 2 < e.x + e.width &&
            cy + shape.height / 2 > e.y &&
            cy - shape.height / 2 < e.y + e.height,
        ).length > 0;
      for (let i = 0; i < 10 && overlaps(y); i++) y += Math.max(shape.height, 80) + 30;
      return { x, y };
    });
  }
}

// ---- cập nhật thuộc tính (hoàn tác được) -----------------------------------------------------------------------

class UpdatePropertiesHandler {
  static $inject = ["elementRegistry"];
  private registry: any;

  constructor(registry: any) {
    this.registry = registry;
  }

  private affected(element: DiagramElement) {
    const list = [element];
    for (const c of [...(element.incoming ?? []), ...(element.outgoing ?? [])]) list.push(c);
    if (element.source) list.push(element.source, ...(element.source.outgoing ?? []));
    return list;
  }

  execute(ctx: any) {
    const bo = boOf(ctx.element);
    ctx.old = {};
    for (const [key, value] of Object.entries(ctx.properties)) {
      ctx.old[key] = bo.get(key);
      bo.set(key, value);
    }
    return this.affected(ctx.element);
  }

  revert(ctx: any) {
    const bo = boOf(ctx.element);
    for (const [key, value] of Object.entries(ctx.old)) bo.set(key, value);
    return this.affected(ctx.element);
  }
}

class PropertiesSupport {
  static $inject = ["commandStack"];

  constructor(commandStack: any) {
    commandStack.registerHandler("bamboo.updateProperties", UpdatePropertiesHandler);
  }
}

export const updateProperties = (injector: any, element: DiagramElement, properties: Record<string, unknown>) =>
  injector.get("commandStack").execute("bamboo.updateProperties", { element, properties });

// ---- sửa nhãn trực tiếp ----------------------------------------------------------------------------------------

class LabelEditing {
  static $inject = ["eventBus", "canvas", "directEditing", "commandStack"];
  private canvas: any;
  private commandStack: any;

  constructor(eventBus: any, canvas: any, directEditing: any, commandStack: any) {
    this.canvas = canvas;
    this.commandStack = commandStack;
    directEditing.registerProvider(this);
    eventBus.on("element.dblclick", ({ element }: any) => directEditing.activate(element));
    eventBus.on(["autoPlace.end", "create.end"], 500, (event: any) => {
      const shape = event.shape ?? event.context?.shape;
      if (shape && isAny(boOf(shape), ["bpmn:Task", "bpmn:SubProcess"])) directEditing.activate(shape);
    });
    eventBus.on(["element.mousedown", "drag.init", "canvas.viewbox.changing"], () => {
      if (directEditing.isActive()) directEditing.complete();
    });
  }

  activate(element: DiagramElement) {
    if (!element?.parent || !element.businessObject) return;
    const bo = boOf(element);
    const kind = kindOf(bo);
    const name = bo.name ?? "";
    const zoom = this.canvas.zoom();
    const style = { fontFamily: FONT.family, fontSize: `${FONT.size * zoom}px`, lineHeight: 1.2 };
    if (kind === "task" || kind === "subprocess") {
      const bounds = this.canvas.getAbsoluteBBox(isExpanded(element) ? { ...element, height: 30 } : element);
      return {
        bounds,
        text: name,
        style: { ...style, paddingTop: `${7 * zoom}px` },
        options: { centerVertically: !isExpanded(element) },
      };
    }
    if (kind === "flow") {
      const box = flowLabel(element, name || "…");
      const bounds = this.canvas.getAbsoluteBBox({ ...box, x: box.x - 15, width: Math.max(box.width, 60) + 30 });
      return { bounds, text: name, style, options: { autoResize: true } };
    }
    if (kind === "event" || kind === "gateway") {
      const box = shapeLabel(element, name || "…");
      const bounds = this.canvas.getAbsoluteBBox({ ...box, x: box.x - 15, width: Math.max(box.width, 60) + 30 });
      return { bounds, text: name, style, options: { autoResize: true } };
    }
  }

  update(element: DiagramElement, newText: string) {
    const text = newText.trim();
    if ((boOf(element).name ?? "") === text) return;
    this.commandStack.execute("bamboo.updateProperties", { element, properties: { name: text || undefined } });
  }
}

// ---- bảng công cụ và menu ngữ cảnh -----------------------------------------------------------------------------

const icon = (body: string, w = 28, h = 28) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 28 28" fill="none" stroke="#22242a" stroke-width="1.6">${body}</svg>`,
  )}`;

export const ICONS = {
  hand: icon(
    '<path d="M9 15V8a1.5 1.5 0 0 1 3 0v5V6a1.5 1.5 0 0 1 3 0v7V7a1.5 1.5 0 0 1 3 0v8V10a1.5 1.5 0 0 1 3 0v7c0 4-3 7-7 7h-1c-3 0-5-2-6.5-4L6 16c-.8-1.3.9-2.6 2-1.5z"/>',
  ),
  lasso: icon('<rect x="5" y="5" width="18" height="18" stroke-dasharray="3 2.5"/>'),
  connect: icon('<path d="M5 22 21 6"/><path d="m14 6h7v7" />'),
  start: icon('<circle cx="14" cy="14" r="9" stroke-width="2"/>'),
  timer: icon('<circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="8"/><path d="M14 9v5l3 2"/>'),
  end: icon('<circle cx="14" cy="14" r="9" stroke-width="3.5"/>'),
  exclusive: icon('<path d="M14 3 25 14 14 25 3 14Z"/><path d="m10 10 8 8m0-8-8 8" stroke-width="2.4"/>'),
  parallel: icon('<path d="M14 3 25 14 14 25 3 14Z"/><path d="M14 8v12M8 14h12" stroke-width="2.4"/>'),
  inclusive: icon('<path d="M14 3 25 14 14 25 3 14Z"/><circle cx="14" cy="14" r="5" stroke-width="2"/>'),
  userTask: icon(
    '<rect x="3" y="6" width="22" height="16" rx="3"/><circle cx="10" cy="11" r="2"/><path d="M6.5 17c0-3 7-3 7 0z"/>',
  ),
  serviceTask: icon(
    '<rect x="3" y="6" width="22" height="16" rx="3"/><circle cx="10" cy="12.5" r="2.6"/><path d="M10 8v1.3M10 15.7V17M5.5 12.5h1.3M13.2 12.5h1.3" stroke-width="2"/>',
  ),
  scriptTask: icon(
    '<rect x="3" y="6" width="22" height="16" rx="3"/><path d="M7 9h6c-2 2 1.5 4-.5 6.5H7c2-2.5-1.5-4.5 0-6.5z"/>',
  ),
  subProcess: icon(
    '<rect x="3" y="6" width="22" height="16" rx="3"/><rect x="11" y="15" width="6" height="6"/><path d="M14 16v4M12 18h4"/>',
  ),
  remove: icon('<path d="M6 8h16M11 8V5.5h6V8M8 8l1 15h10l1-15M12 12v7M16 12v7"/>'),
};

type Entry = { group: string; title: string; imageUrl: string; action: any };

class BambooPalette {
  static $inject = ["palette", "create", "elementFactory", "handTool", "lassoTool", "globalConnect"];
  private create: any;
  private factory: any;
  private handTool: any;
  private lassoTool: any;
  private globalConnect: any;

  constructor(palette: any, create: any, factory: any, handTool: any, lassoTool: any, globalConnect: any) {
    this.create = create;
    this.factory = factory;
    this.handTool = handTool;
    this.lassoTool = lassoTool;
    this.globalConnect = globalConnect;
    palette.registerProvider(this);
  }

  private shape(group: string, title: string, imageUrl: string, spec: ShapeSpec): Entry {
    const start = (event: Event) => this.create.start(event, this.factory.createShape(spec));
    return { group, title, imageUrl, action: { dragstart: start, click: start } };
  }

  getPaletteEntries() {
    return {
      "hand-tool": {
        group: "tools",
        title: tr("Kéo sơ đồ"),
        imageUrl: ICONS.hand,
        action: { click: (e: Event) => this.handTool.activateHand(e) },
      },
      "lasso-tool": {
        group: "tools",
        title: tr("Chọn nhiều phần tử"),
        imageUrl: ICONS.lasso,
        action: { click: (e: Event) => this.lassoTool.activateSelection(e) },
      },
      "global-connect-tool": {
        group: "tools",
        title: tr("Nối các phần tử"),
        imageUrl: ICONS.connect,
        action: { click: (e: Event) => this.globalConnect.start(e) },
      },
      "tool-separator": { group: "tools", separator: true },
      "create.start-event": this.shape("event", tr("Sự kiện bắt đầu"), ICONS.start, { type: "bpmn:StartEvent" }),
      "create.timer-event": this.shape("event", tr("Chờ hẹn giờ"), ICONS.timer, {
        type: "bpmn:IntermediateCatchEvent",
        eventDefinition: "TimerEventDefinition",
      }),
      "create.end-event": this.shape("event", tr("Sự kiện kết thúc"), ICONS.end, { type: "bpmn:EndEvent" }),
      "event-separator": { group: "event", separator: true },
      "create.exclusive-gateway": this.shape("gateway", tr("Cổng rẽ một nhánh"), ICONS.exclusive, {
        type: "bpmn:ExclusiveGateway",
      }),
      "create.parallel-gateway": this.shape("gateway", tr("Cổng song song"), ICONS.parallel, {
        type: "bpmn:ParallelGateway",
      }),
      "create.inclusive-gateway": this.shape("gateway", tr("Cổng rẽ nhiều nhánh"), ICONS.inclusive, {
        type: "bpmn:InclusiveGateway",
      }),
      "gateway-separator": { group: "gateway", separator: true },
      "create.user-task": this.shape("activity", tr("Tác vụ người dùng"), ICONS.userTask, { type: "bpmn:UserTask" }),
      "create.service-task": this.shape("activity", tr("Tác vụ tự động"), ICONS.serviceTask, {
        type: "bpmn:ServiceTask",
      }),
      "create.script-task": this.shape("activity", tr("Tác vụ kịch bản"), ICONS.scriptTask, {
        type: "bpmn:ScriptTask",
      }),
      "create.subprocess": this.shape("activity", tr("Quy trình con"), ICONS.subProcess, {
        type: "bpmn:SubProcess",
        isExpanded: true,
      }),
    };
  }
}

class BambooContextPad {
  static $inject = ["contextPad", "create", "elementFactory", "autoPlace", "connect", "modeling", "rules"];
  private create: any;
  private factory: any;
  private autoPlace: any;
  private connect: any;
  private modeling: any;
  private rules: any;

  constructor(contextPad: any, create: any, factory: any, autoPlace: any, connect: any, modeling: any, rules: any) {
    this.create = create;
    this.factory = factory;
    this.autoPlace = autoPlace;
    this.connect = connect;
    this.modeling = modeling;
    this.rules = rules;
    contextPad.registerProvider(this);
  }

  private append(element: DiagramElement, title: string, imageUrl: string, spec: ShapeSpec): Entry {
    return {
      group: "model",
      title,
      imageUrl,
      action: {
        click: () => this.autoPlace.append(element, this.factory.createShape(spec)),
        dragstart: (event: Event) => this.create.start(event, this.factory.createShape(spec), { source: element }),
      },
    };
  }

  getContextPadEntries(element: DiagramElement) {
    const entries: Record<string, Entry> = {};
    const bo = boOf(element);
    if (!element.waypoints && !is(bo, "bpmn:EndEvent")) {
      entries["append.user-task"] = this.append(element, tr("Nối thêm tác vụ người dùng"), ICONS.userTask, {
        type: "bpmn:UserTask",
      });
      entries["append.service-task"] = this.append(element, tr("Nối thêm tác vụ tự động"), ICONS.serviceTask, {
        type: "bpmn:ServiceTask",
      });
      entries["append.gateway"] = this.append(element, tr("Nối thêm cổng rẽ nhánh"), ICONS.exclusive, {
        type: "bpmn:ExclusiveGateway",
      });
      entries["append.end-event"] = this.append(element, tr("Nối thêm sự kiện kết thúc"), ICONS.end, {
        type: "bpmn:EndEvent",
      });
      entries.connect = {
        group: "connect",
        title: tr("Nối tới phần tử khác"),
        imageUrl: ICONS.connect,
        action: {
          click: (event: Event) => this.connect.start(event, element),
          dragstart: (event: Event) => this.connect.start(event, element),
        },
      };
    }
    if (this.rules.allowed("elements.delete", { elements: [element] }) !== false) {
      entries.delete = {
        group: "edit",
        title: tr("Xóa"),
        imageUrl: ICONS.remove,
        action: { click: () => this.modeling.removeElements([element]) },
      };
    }
    return entries;
  }
}

// ---- khai báo module -------------------------------------------------------------------------------------------

export const coreModule = {
  __init__: ["bambooRenderer"],
  bambooRenderer: ["type", BambooRenderer],
  elementFactory: ["type", BambooElementFactory],
};

export const layoutModule = {
  connectionDocking: ["type", CroppingConnectionDocking],
  layouter: ["type", BambooLayouter],
};

export const modelingModule = {
  __init__: [
    "bambooRules",
    "bambooAutoPlace",
    "bambooProperties",
    "bambooLabelEditing",
    "bambooPalette",
    "bambooContextPad",
  ],
  bambooRules: ["type", BambooRules],
  bambooAutoPlace: ["type", BambooAutoPlace],
  bambooProperties: ["type", PropertiesSupport],
  bambooLabelEditing: ["type", LabelEditing],
  bambooPalette: ["type", BambooPalette],
  bambooContextPad: ["type", BambooContextPad],
};
