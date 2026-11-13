/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { BpmnModdle } from "bpmn-moddle";

export type Bo = any;
export type DiagramElement = any;

export const createModdle = (extensions: Record<string, unknown> = {}) => new BpmnModdle(extensions as any);

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
