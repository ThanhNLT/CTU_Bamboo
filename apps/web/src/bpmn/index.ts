/* eslint-disable @typescript-eslint/no-explicit-any */
// Trình xem và trình thiết kế sơ đồ BPMN của Bamboo (ADR #81), dựng trên diagram-js và bpmn-moddle (MIT).
// Thay cho bpmn-js (giấy phép bpmn.io chưa được OSI phê duyệt).
import Diagram from "diagram-js";
import AttachSupportModule from "diagram-js/lib/features/attach-support";
import AutoPlaceModule from "diagram-js/lib/features/auto-place";
import AutoScrollModule from "diagram-js/lib/features/auto-scroll";
import BendpointsModule from "diagram-js/lib/features/bendpoints";
import ConnectModule from "diagram-js/lib/features/connect";
import ConnectionPreviewModule from "diagram-js/lib/features/connection-preview";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import CreateModule from "diagram-js/lib/features/create";
import EditorActionsModule from "diagram-js/lib/features/editor-actions";
import GlobalConnectModule from "diagram-js/lib/features/global-connect";
import HandToolModule from "diagram-js/lib/features/hand-tool";
import InteractionEventsModule from "diagram-js/lib/features/interaction-events";
import KeyboardModule from "diagram-js/lib/features/keyboard";
import KeyboardMoveSelectionModule from "diagram-js/lib/features/keyboard-move-selection";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import ModelingModule from "diagram-js/lib/features/modeling";
import MoveModule from "diagram-js/lib/features/move";
import OutlineModule from "diagram-js/lib/features/outline";
import PaletteModule from "diagram-js/lib/features/palette";
import ResizeModule from "diagram-js/lib/features/resize";
import RulesModule from "diagram-js/lib/features/rules";
import SelectionModule from "diagram-js/lib/features/selection";
import SnappingModule from "diagram-js/lib/features/snapping";
import MoveCanvasModule from "diagram-js/lib/navigation/movecanvas";
import ZoomScrollModule from "diagram-js/lib/navigation/zoomscroll";
import DirectEditingModule from "diagram-js-direct-editing";
import "diagram-js/assets/diagram-js.css";

import { DocumentState, exportXml, importXml, type ImportResult } from "./io";
import { createModdle, Ids } from "./model";
import { coreModule, layoutModule, modelingModule } from "./modules";
import "./bpmn.css";

export { updateProperties } from "./modules";
export type { Bo, DiagramElement } from "./model";

type Options = {
  container: HTMLElement;
  moddleExtensions?: Record<string, unknown>;
  modules?: unknown[];
};

const VIEWER_MODULES = [
  coreModule,
  InteractionEventsModule,
  SelectionModule,
  OutlineModule,
  MoveCanvasModule,
  ZoomScrollModule,
];

const MODELER_MODULES = [
  coreModule,
  InteractionEventsModule,
  SelectionModule,
  OutlineModule,
  MoveCanvasModule,
  ZoomScrollModule,
  RulesModule,
  ModelingModule,
  layoutModule,
  MoveModule,
  CreateModule,
  ConnectModule,
  ConnectionPreviewModule,
  BendpointsModule,
  ResizeModule,
  AttachSupportModule,
  SnappingModule,
  AutoScrollModule,
  AutoPlaceModule,
  PaletteModule,
  ContextPadModule,
  HandToolModule,
  LassoToolModule,
  GlobalConnectModule,
  KeyboardModule,
  KeyboardMoveSelectionModule,
  EditorActionsModule,
  DirectEditingModule,
  modelingModule,
];

class BpmnDiagram {
  private diagram: any;
  private state = new DocumentState();
  readonly editable: boolean;

  constructor(options: Options, editable: boolean) {
    this.editable = editable;
    const moddle = createModdle(options.moddleExtensions);
    const services = { moddle: ["value", moddle], bambooIds: ["value", new Ids()] };
    const base = editable ? MODELER_MODULES : VIEWER_MODULES;
    this.diagram = new (Diagram as any)({
      canvas: { container: options.container },
      keyboard: editable ? {} : { bind: false },
      modules: [services, ...base, ...(options.modules ?? [])],
    });
    this.diagram.get("canvas").getContainer().classList.add("bamboo-diagram");
  }

  get<T = any>(name: string, strict = true): T {
    return this.diagram.get(name, strict);
  }

  on(event: string | string[], priorityOrCallback: any, callback?: any) {
    this.diagram.get("eventBus").on(event, priorityOrCallback, callback);
  }

  async importXML(xml: string): Promise<ImportResult> {
    this.diagram.clear();
    this.get("commandStack", false)?.clear?.();
    const result = await importXml(this.diagram, this.state, xml);
    this.get("eventBus").fire("import.done", result);
    return result;
  }

  async saveXML(options: { format?: boolean } = {}): Promise<{ xml: string }> {
    return { xml: await exportXml(this.diagram, this.state, !!options.format) };
  }

  destroy() {
    this.diagram.destroy();
  }
}

export type { BpmnDiagram };

export const createViewer = (options: Options) => new BpmnDiagram(options, false);
export const createModeler = (options: Options) => new BpmnDiagram(options, true);
