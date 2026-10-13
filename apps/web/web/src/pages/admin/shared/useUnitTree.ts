// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import type { OrgData } from "./orgData";

/** Cây đơn vị đang hoạt động cho TreeSelect (chọn đơn vị cha, đơn vị neo phạm vi...). */
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
