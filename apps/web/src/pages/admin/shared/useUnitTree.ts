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

import { useMemo } from "react";

import type { OrgData } from "./orgData";

export const useUnitTree = (org: OrgData, exclude?: string) =>
  useMemo(() => {
    type Node = { value: string; title: string; children: Node[] };
    const active = org.units.filter((u) => u.period.active && u.id !== exclude);
    const nodes = new Map(
      active.map((u) => [u.id, { value: u.id, title: `${u.name} · ${u.code}`, children: [] as Node[] }]),
    );
    const roots: Node[] = [];
    for (const u of active) {
      const node = nodes.get(u.id)!;
      const parent = u.parent_id ? nodes.get(u.parent_id) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }, [org.units, exclude]);
