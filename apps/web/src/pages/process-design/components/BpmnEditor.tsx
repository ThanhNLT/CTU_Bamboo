// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import "../editor.css";
import { vietnameseModule } from "../bpmn-translate";
import { bambooModdle, flowableModdle } from "../flowable-moddle";
import type { SelectedElement } from "../types";
import { tr, trf } from "../../../i18n";

export type BpmnEditorHandle = {
  getXml: () => Promise<string>;
  select: (id: string) => void;
  update: (id: string, patch: Partial<SelectedElement>) => void;
  highlight: (ids: string[]) => void;
};

type Props = {
  xml: string;
  readOnly: boolean;
  onSelect: (el: SelectedElement | undefined) => void;
  onChange: () => void;
  onError: (message: string) => void;
};

type Bo = {
  id: string;
  $type: string;
  name?: string;
  get: (key: string) => unknown;
  conditionExpression?: { body?: string };
  sourceRef?: { default?: { id: string } };
  eventDefinitions?: { $type: string; timeCycle?: { body?: string } }[];
};
type Element = { id: string; type: string; businessObject: Bo };
type Box = { x: number; y: number; width: number; height: number };
type Canvas = {
  zoom: (value?: number | string, center?: string | { x: number; y: number }) => number;
  resized: () => void;
  viewbox: (box?: Box) => { inner: Box; outer: { width: number; height: number } };
  addMarker: (id: string, c: string) => void;
  removeMarker: (id: string, c: string) => void;
  scrollToElement: (e: Element) => void;
};
type Viewer = Modeler | NavigatedViewer;

const MIN_SCALE = 0.25;
const MAX_SCALE = 1.2;
const PALETTE_WIDTH = 124;
const MARGIN = 28;

const describe = (el: Element | undefined): SelectedElement | undefined => {
  if (!el || el.type === "bpmn:Process" || el.type === "label") return undefined;
  const bo = el.businessObject;
  const str = (key: string) => (bo.get(key) as string | undefined) ?? undefined;
  return {
    id: el.id,
    type: el.type.replace("bpmn:", ""),
    name: bo.name ?? "",
    assignee: str("flowable:assignee"),
    candidateGroups: str("flowable:candidateGroups"),
    dueDate: str("flowable:dueDate"),
    formKey: str("flowable:formKey"),
    expression: str("flowable:expression"),
    condition: bo.conditionExpression?.body,
    isDefaultFlow: bo.sourceRef?.default?.id === el.id,
    automationAction: str("bamboo:action"),
    automationAudience: str("bamboo:audience"),
    automationMessage: str("bamboo:message"),
    automationUrl: str("bamboo:url"),
    automationMethod: str("bamboo:method"),
    automationBody: str("bamboo:body"),
    automationName: str("bamboo:name"),
    automationValue: str("bamboo:value"),
    automationScript: str("bamboo:script"),
    timerCycle: bo.eventDefinitions?.find((d) => d.$type === "bpmn:TimerEventDefinition")?.timeCycle?.body,
  };
};

// Đặt sơ đồ vừa khung nhìn, chừa chỗ cho bảng công cụ ở bên trái khi đang sửa.
const fit = (canvas: Canvas, leftInset: number) => {
  canvas.resized();
  const { inner, outer } = canvas.viewbox();
  if (!outer.width || !outer.height || !inner.width || !inner.height) return;
  const availW = Math.max(outer.width - leftInset - MARGIN, 120);
  const availH = Math.max(outer.height - 2 * MARGIN, 120);
  const scale = Math.min(Math.max(Math.min(availW / inner.width, availH / inner.height), MIN_SCALE), MAX_SCALE);
  const x = inner.x - (leftInset + (availW - inner.width * scale) / 2) / scale;
  const y = inner.y - (MARGIN + (availH - inner.height * scale) / 2) / scale;
  canvas.viewbox({ x, y, width: outer.width / scale, height: outer.height / scale });
};

export const BpmnEditor = forwardRef<BpmnEditorHandle, Props>(function BpmnEditor(
  { xml, readOnly, onSelect, onChange, onError },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | undefined>(undefined);
  const highlighted = useRef<string[]>([]);
  const picked = useRef<string | undefined>(undefined);
  const moved = useRef(false);
  const handlers = useRef({ onSelect, onChange, onError });
  handlers.current = { onSelect, onChange, onError };
  const inset = readOnly ? MARGIN : PALETTE_WIDTH;

  const canvasOf = () => viewer.current?.get("canvas") as Canvas | undefined;
  const refit = () => {
    const canvas = canvasOf();
    if (!canvas) return;
    moved.current = false;
    fit(canvas, inset);
  };

  useEffect(() => {
    const options = {
      container: container.current!,
      moddleExtensions: { flowable: flowableModdle, bamboo: bambooModdle },
      additionalModules: [vietnameseModule],
    };
    const v: Viewer = readOnly ? new NavigatedViewer(options) : new Modeler(options);
    viewer.current = v;
    if (readOnly) {
      // Chế độ xem không có dịch vụ chọn phần tử: tự đánh dấu phần tử được bấm
      v.on("element.click", (e: { element: Element }) => {
        const canvas = v.get("canvas") as Canvas;
        if (picked.current) canvas.removeMarker(picked.current, "bamboo-picked");
        const el = describe(e.element);
        picked.current = el?.id;
        if (el) canvas.addMarker(el.id, "bamboo-picked");
        handlers.current.onSelect(el);
      });
      v.on("canvas.click", () => {
        if (picked.current) (v.get("canvas") as Canvas).removeMarker(picked.current, "bamboo-picked");
        picked.current = undefined;
        handlers.current.onSelect(undefined);
      });
    } else {
      v.on("selection.changed", (e: { newSelection: Element[] }) =>
        handlers.current.onSelect(describe(e.newSelection[0])),
      );
      v.on("element.changed", (e: { element: Element }) => {
        const sel = (v.get("selection") as { get: () => Element[] }).get()[0];
        if (sel && sel.id === e.element.id) handlers.current.onSelect(describe(sel));
      });
      v.on("commandStack.changed", () => handlers.current.onChange());
    }

    const el = container.current!;
    const touch = () => (moved.current = true);
    el.addEventListener("wheel", touch, { passive: true });
    el.addEventListener("pointerdown", touch);
    const observer = new ResizeObserver(() => {
      const canvas = v.get("canvas") as Canvas;
      if (moved.current) canvas.resized();
      else fit(canvas, readOnly ? MARGIN : PALETTE_WIDTH);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", touch);
      el.removeEventListener("pointerdown", touch);
      v.destroy();
      viewer.current = undefined;
      picked.current = undefined;
    };
  }, [readOnly]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    let alive = true;
    v.importXML(xml)
      .then(() => {
        if (!alive) return;
        refit();
        const canvas = canvasOf()!;
        const registry = v.get("elementRegistry") as { get: (id: string) => unknown };
        highlighted.current = highlighted.current.filter((id) => registry.get(id));
        highlighted.current.forEach((id) => canvas.addMarker(id, "sandbox-visited"));
        handlers.current.onSelect(undefined);
      })
      .catch((e: Error) => handlers.current.onError(trf("Không đọc được sơ đồ BPMN: {0}", [e.message])));
    return () => {
      alive = false;
    };
    // refit và canvasOf chỉ đọc ref; kích thước bảng công cụ đổi theo readOnly đã nằm trong danh sách phụ thuộc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml, readOnly]);

  useImperativeHandle(
    ref,
    () => ({
      getXml: async () => {
        const { xml: out } = await viewer.current!.saveXML({ format: true });
        return out ?? "";
      },
      select: (id: string) => {
        const v = viewer.current!;
        const el = (v.get("elementRegistry") as { get: (id: string) => Element | undefined }).get(id);
        if (!el) return;
        const selection = v.get("selection", false) as { select: (e: Element) => void } | null;
        if (selection) selection.select(el);
        else handlers.current.onSelect(describe(el));
        canvasOf()?.scrollToElement(el);
      },
      update: (id: string, patch: Partial<SelectedElement>) => {
        const v = viewer.current;
        if (!v || !(v instanceof Modeler)) return;
        const el = (v.get("elementRegistry") as { get: (id: string) => Element | undefined }).get(id);
        if (!el) return;
        const modeling = v.get("modeling") as {
          updateProperties: (e: Element, props: Record<string, unknown>) => void;
        };
        const props: Record<string, unknown> = {};
        if (patch.name !== undefined) props.name = patch.name;
        const attrs: Array<[keyof SelectedElement, string]> = [
          ["assignee", "flowable:assignee"],
          ["candidateGroups", "flowable:candidateGroups"],
          ["dueDate", "flowable:dueDate"],
          ["formKey", "flowable:formKey"],
          ["expression", "flowable:expression"],
          ["automationAction", "bamboo:action"],
          ["automationAudience", "bamboo:audience"],
          ["automationMessage", "bamboo:message"],
          ["automationUrl", "bamboo:url"],
          ["automationMethod", "bamboo:method"],
          ["automationBody", "bamboo:body"],
          ["automationName", "bamboo:name"],
          ["automationValue", "bamboo:value"],
          ["automationScript", "bamboo:script"],
        ];
        for (const [key, attr] of attrs) {
          if (patch[key] !== undefined) props[attr] = (patch[key] as string) || undefined;
        }
        if (patch.condition !== undefined) {
          const moddle = v.get("moddle") as { create: (t: string, a: Record<string, unknown>) => unknown };
          props.conditionExpression = patch.condition
            ? moddle.create("bpmn:FormalExpression", { body: patch.condition })
            : undefined;
        }
        if (patch.timerCycle !== undefined) {
          const moddle = v.get("moddle") as { create: (t: string, a: Record<string, unknown>) => unknown };
          props.eventDefinitions = patch.timerCycle
            ? [
                moddle.create("bpmn:TimerEventDefinition", {
                  timeCycle: moddle.create("bpmn:FormalExpression", { body: patch.timerCycle }),
                }),
              ]
            : [];
        }
        modeling.updateProperties(el, props);
      },
      highlight: (ids: string[]) => {
        const canvas = canvasOf();
        if (!canvas) return;
        highlighted.current.forEach((id) => canvas.removeMarker(id, "sandbox-visited"));
        ids.forEach((id) => canvas.addMarker(id, "sandbox-visited"));
        highlighted.current = ids;
      },
    }),
    [],
  );

  const zoomBy = (factor: number) => {
    const canvas = canvasOf();
    if (!canvas) return;
    moved.current = true;
    canvas.zoom(Math.min(Math.max(canvas.zoom() * factor, MIN_SCALE), 4), "auto");
  };

  return (
    <div className="bpmn-frame">
      <div
        ref={container}
        className={readOnly ? "bpmn-editor bpmn-editor--readonly" : "bpmn-editor"}
        aria-label={tr("Sơ đồ BPMN")}
        role="application"
      />
      <div className="bpmn-zoom" role="group" aria-label={tr("Phóng to thu nhỏ")}>
        <button type="button" aria-label={tr("Phóng to")} title={tr("Phóng to")} onClick={() => zoomBy(1.25)}>
          <ZoomIn size={16} aria-hidden />
        </button>
        <button type="button" aria-label={tr("Thu nhỏ")} title={tr("Thu nhỏ")} onClick={() => zoomBy(0.8)}>
          <ZoomOut size={16} aria-hidden />
        </button>
        <button type="button" aria-label={tr("Vừa khung nhìn")} title={tr("Vừa khung nhìn")} onClick={refit}>
          <Maximize2 size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
});

export default BpmnEditor;
