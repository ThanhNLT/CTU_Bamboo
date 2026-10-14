// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import Modeler from "bpmn-js/lib/Modeler";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import "../editor.css";
import { flowableModdle } from "../flowable-moddle";
import type { SelectedElement } from "../types";

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
};
type Element = { id: string; type: string; businessObject: Bo };

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
  };
};

export const BpmnEditor = forwardRef<BpmnEditorHandle, Props>(function BpmnEditor(
  { xml, readOnly, onSelect, onChange, onError },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const modeler = useRef<Modeler | undefined>(undefined);
  const highlighted = useRef<string[]>([]);
  const handlers = useRef({ onSelect, onChange, onError });
  handlers.current = { onSelect, onChange, onError };

  useEffect(() => {
    const m = new Modeler({
      container: container.current!,
      keyboard: { bindTo: document },
      moddleExtensions: { flowable: flowableModdle },
    });
    modeler.current = m;
    m.on("selection.changed", (e: { newSelection: Element[] }) =>
      handlers.current.onSelect(describe(e.newSelection[0])),
    );
    m.on("element.changed", (e: { element: Element }) => {
      const sel = (m.get("selection") as { get: () => Element[] }).get()[0];
      if (sel && sel.id === e.element.id) handlers.current.onSelect(describe(sel));
    });
    m.on("commandStack.changed", () => handlers.current.onChange());
    return () => m.destroy();
  }, []);

  useEffect(() => {
    const m = modeler.current;
    if (!m) return;
    highlighted.current = [];
    m.importXML(xml)
      .then(() => {
        (m.get("canvas") as { zoom: (v: string) => void }).zoom("fit-viewport");
        handlers.current.onSelect(undefined);
      })
      .catch((e: Error) => handlers.current.onError(`Không đọc được sơ đồ BPMN: ${e.message}`));
  }, [xml]);

  useImperativeHandle(
    ref,
    () => ({
      getXml: async () => {
        const { xml: out } = await modeler.current!.saveXML({ format: true });
        return out ?? "";
      },
      select: (id: string) => {
        const m = modeler.current!;
        const el = (m.get("elementRegistry") as { get: (id: string) => Element | undefined }).get(id);
        if (!el) return;
        (m.get("selection") as { select: (e: Element) => void }).select(el);
        (m.get("canvas") as { scrollToElement: (e: Element) => void }).scrollToElement(el);
      },
      update: (id: string, patch: Partial<SelectedElement>) => {
        const m = modeler.current!;
        const el = (m.get("elementRegistry") as { get: (id: string) => Element | undefined }).get(id);
        if (!el) return;
        const modeling = m.get("modeling") as {
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
        ];
        for (const [key, attr] of attrs) {
          if (patch[key] !== undefined) props[attr] = (patch[key] as string) || undefined;
        }
        if (patch.condition !== undefined) {
          const moddle = m.get("moddle") as { create: (t: string, a: Record<string, unknown>) => unknown };
          props.conditionExpression = patch.condition
            ? moddle.create("bpmn:FormalExpression", { body: patch.condition })
            : undefined;
        }
        modeling.updateProperties(el, props);
      },
      highlight: (ids: string[]) => {
        const canvas = modeler.current!.get("canvas") as {
          addMarker: (id: string, c: string) => void;
          removeMarker: (id: string, c: string) => void;
        };
        highlighted.current.forEach((id) => canvas.removeMarker(id, "sandbox-visited"));
        ids.forEach((id) => canvas.addMarker(id, "sandbox-visited"));
        highlighted.current = ids;
      },
    }),
    [],
  );

  return (
    <div
      ref={container}
      className={readOnly ? "bpmn-editor bpmn-editor--readonly" : "bpmn-editor"}
      aria-label="Sơ đồ BPMN"
      role="application"
    />
  );
});

export default BpmnEditor;
