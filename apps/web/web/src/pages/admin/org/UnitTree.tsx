// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Checkbox, ConfigProvider, Tree } from "antd";
import { Building2, Folder } from "lucide-react";
import { useMemo, useState, type Key, type ReactNode } from "react";

import { SearchInput } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { fold } from "../../../utils/text";
import type { Unit } from "../shared/orgData";

type Node = { key: string; title: ReactNode; children: Node[]; isLeaf?: boolean };

export const UnitTree = ({
  units,
  selectedId,
  onSelect,
  showEnded,
  onShowEndedChange,
  className,
}: {
  units: Unit[];
  selectedId?: string;
  onSelect: (id: string) => void;
  showEnded: boolean;
  onShowEndedChange: (v: boolean) => void;
  className?: string;
}) => {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Key[]>();

  const { tree, matches, defaultExpanded } = useMemo(() => {
    const q = fold(query.trim());
    const visible = units.filter((u) => showEnded || !u.period.ended);
    const byId = new Map(visible.map((u) => [u.id, u]));
    const hit = new Set(visible.filter((u) => !q || fold(`${u.name} ${u.code}`).includes(q)).map((u) => u.id));
    const keep = new Set<string>();
    for (const id of hit) {
      for (let u = byId.get(id); u && !keep.has(u.id); u = u.parent_id ? byId.get(u.parent_id) : undefined)
        keep.add(u.id);
    }
    const nodes = new Map<string, Node>();
    for (const u of visible.filter((x) => keep.has(x.id))) {
      const Icon = u.is_legal_entity ? Building2 : Folder;
      nodes.set(u.id, {
        key: u.id,
        children: [],
        title: (
          <span className={cn("inline-flex min-w-0 items-center gap-1.5", u.period.ended && "text-muted line-through")}>
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", u.is_legal_entity ? "text-bamboo-700" : "text-muted")}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className={cn("truncate", q && hit.has(u.id) && "font-semibold")}>{u.name}</span>
          </span>
        ),
      });
    }
    const roots: Node[] = [];
    for (const u of visible) {
      const node = nodes.get(u.id);
      if (!node) continue;
      const parent = u.parent_id ? nodes.get(u.parent_id) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    for (const n of nodes.values()) n.isLeaf = n.children.length === 0;
    const open = q ? [...keep] : roots.flatMap((r) => [r.key, ...r.children.map((c) => c.key)]);
    return { tree: roots, matches: hit.size, defaultExpanded: open };
  }, [units, query, showEnded]);

  return (
    <section
      aria-label="Cây đơn vị"
      className={cn("flex min-h-0 flex-col rounded-2xl border border-line bg-white p-3 shadow-card", className)}
    >
      <SearchInput
        value={query}
        onChange={(v) => {
          setQuery(v);
          setExpanded(undefined);
        }}
        placeholder="Tìm đơn vị theo tên, mã"
      />
      <div className="mt-2 flex items-center justify-between px-1 text-[11.5px] text-muted">
        <span>{query ? `${matches} kết quả` : `${units.filter((u) => !u.period.ended).length} đơn vị`}</span>
        <Checkbox checked={showEnded} onChange={(e) => onShowEndedChange(e.target.checked)}>
          <span className="text-[11.5px] text-muted">Hiện đã ngừng</span>
        </Checkbox>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        <ConfigProvider theme={{ components: { Tree: { nodeSelectedBg: "#e1f0e3", nodeHoverBg: "#f0f7f1" } } }}>
          <Tree
            blockNode
            showLine={{ showLeafIcon: false }}
            treeData={tree}
            selectedKeys={selectedId ? [selectedId] : []}
            expandedKeys={expanded ?? defaultExpanded}
            onExpand={setExpanded}
            onSelect={(keys) => keys[0] && onSelect(String(keys[0]))}
          />
        </ConfigProvider>
      </div>
    </section>
  );
};
