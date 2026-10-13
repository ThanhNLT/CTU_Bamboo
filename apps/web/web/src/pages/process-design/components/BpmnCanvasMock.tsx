// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Canvas BPMN giả lập: phần tử là <div> định vị tuyệt đối theo tọa độ tâm; đường nối vẽ bằng một lớp SVG
// bên dưới (đường gấp khúc + mũi tên). Không dùng bpmn-js — khi cần chỉnh sửa thật, thay component này.
import { Minus, Plus, Redo2, Settings, Undo2 } from "lucide-react";
import { useRef, type DragEvent, type KeyboardEvent } from "react";
import { cn } from "../../../utils/cn";
import { DND_MIME, WORLD } from "../mock";
import type { BpmnNode, NodeType, ProcessModel } from "../types";

const ZOOMS = [50, 75, 100, 125, 150];

const TASK_W = 200;
const TASK_H = 56;
const EVENT_D = 32;
const GW = 34;

const ring = "ring-4 ring-bamboo-100";

const NodeView = ({ node, selected, onSelect }: { node: BpmnNode; selected: boolean; onSelect: () => void }) => {
  const common =
    "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500";
  const style = { left: node.x, top: node.y };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };
  const a11y = { role: "button", tabIndex: 0, "aria-pressed": selected, onClick: onSelect, onKeyDown: onKey } as const;

  if (node.type === "userTask" || node.type === "serviceTask") {
    return (
      <div
        {...a11y}
        aria-label={`${node.type === "userTask" ? "Tác vụ người dùng" : "Tác vụ dịch vụ"}: ${node.name}`}
        style={{ ...style, width: TASK_W, height: TASK_H }}
        className={cn(
          common,
          "flex items-center justify-center gap-2 rounded-lg bg-white px-3 text-center",
          selected ? cn("border-2 border-bamboo-600", ring) : "border-[1.5px] border-ink/80 hover:border-bamboo-500",
        )}
      >
        {node.type === "serviceTask" && (
          <Settings className="h-4 w-4 shrink-0 text-ink" strokeWidth={1.75} aria-hidden />
        )}
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-ink">{node.name || "(chưa đặt tên)"}</div>
          {node.type === "userTask" && (
            <div className="truncate text-[10.5px] text-muted">
              {node.group ?? "—"} · SLA {node.sla || "—"}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (node.type === "gateway") {
    return (
      <div
        {...a11y}
        aria-label={`Cổng rẽ nhánh: ${node.name}`}
        style={{ ...style, width: GW, height: GW }}
        className={cn(common, "grid place-items-center")}
      >
        <span
          className={cn(
            "block h-6 w-6 rotate-45 border-2 border-amber-500 bg-amber-50",
            selected && "ring-4 ring-amber-100",
          )}
        />
      </div>
    );
  }

  // Sự kiện bắt đầu / kết thúc: vòng tròn + nhãn bên cạnh hoặc bên dưới.
  const isEnd = node.type === "end";
  const color = isEnd ? (node.endTone === "danger" ? "border-red-500" : "border-bamboo-600") : "border-bamboo-600";
  return (
    <div style={style} className="absolute">
      <div
        {...a11y}
        aria-label={`${isEnd ? "Sự kiện kết thúc" : "Sự kiện bắt đầu"}: ${node.name}`}
        style={{ width: EVENT_D, height: EVENT_D }}
        className={cn(
          common,
          "left-0 top-0 rounded-full bg-white",
          isEnd ? "border-[3px]" : "border-2",
          color,
          selected && ring,
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute whitespace-nowrap text-[11px] text-body",
          node.labelPos === "below" ? "left-0 top-[22px] -translate-x-1/2" : "left-[24px] top-0 -translate-y-1/2",
        )}
      >
        {node.name}
      </span>
    </div>
  );
};

export const BpmnCanvasMock = ({
  title,
  model,
  selectedId,
  onSelect,
  onDropNode,
  zoom,
  onZoomChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  title: string;
  model: ProcessModel;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onDropNode: (type: NodeType, x: number, y: number) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) => {
  const worldRef = useRef<HTMLDivElement>(null);
  const z = ZOOMS.indexOf(zoom);
  const scale = zoom / 100;

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(DND_MIME) as NodeType;
    const rect = worldRef.current?.getBoundingClientRect();
    if (!type || !rect) return;
    e.preventDefault();
    const clamp = (v: number, max: number) => Math.min(max - 20, Math.max(20, v));
    onDropNode(
      type,
      clamp((e.clientX - rect.left) / scale, WORLD.width),
      clamp((e.clientY - rect.top) / scale, WORLD.height),
    );
  };

  const tool =
    "grid h-7 w-7 place-items-center rounded-full text-body transition-colors hover:bg-canvas disabled:cursor-default disabled:opacity-40 " +
    "focus-visible:outline-2 focus-visible:outline-bamboo-500";

  return (
    <section
      aria-label="Sơ đồ quy trình"
      className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-line bg-white p-4 shadow-card"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="truncate text-[12.5px] text-muted">{title}</h2>
        <div className="flex items-center gap-0.5 rounded-full border border-line bg-white px-1 py-0.5 shadow-card">
          <button type="button" className={tool} onClick={onUndo} disabled={!canUndo} aria-label="Hoàn tác">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={tool} onClick={onRedo} disabled={!canRedo} aria-label="Làm lại">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <button
            type="button"
            className={tool}
            onClick={() => onZoomChange(ZOOMS[z - 1])}
            disabled={z <= 0}
            aria-label="Thu nhỏ"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-[11.5px] tabular-nums text-ink">{zoom}%</span>
          <button
            type="button"
            className={tool}
            onClick={() => onZoomChange(ZOOMS[z + 1])}
            disabled={z >= ZOOMS.length - 1}
            aria-label="Phóng to"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Nền lưới chấm bi; bấm vùng trống để bỏ chọn; thả thành phần từ cột trái để thêm. */}
      <div
        className="relative mt-3 min-h-[480px] flex-1 overflow-auto rounded-xl border border-line/70 bg-[#fafbfa] bg-[radial-gradient(circle,rgb(16_24_20/0.13)_1px,transparent_1.2px)] bg-[length:16px_16px]"
        onClick={(e) => e.target === e.currentTarget && onSelect(undefined)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={onDrop}
      >
        <div style={{ width: WORLD.width * scale, height: WORLD.height * scale }} className="relative mx-auto">
          <div
            ref={worldRef}
            style={{ width: WORLD.width, height: WORLD.height, transform: `scale(${scale})` }}
            className="absolute left-0 top-0 origin-top-left"
            onClick={(e) => e.target === e.currentTarget && onSelect(undefined)}
          >
            <svg width={WORLD.width} height={WORLD.height} className="pointer-events-none absolute inset-0" aria-hidden>
              <defs>
                <marker
                  id="bpmn-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="#36413a" />
                </marker>
              </defs>
              {model.edges.map((e) => (
                <g key={e.id}>
                  <polyline
                    points={e.points.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke="#36413a"
                    strokeWidth={1.4}
                    strokeDasharray={e.dashed ? "5 4" : undefined}
                    markerEnd="url(#bpmn-arrow)"
                  />
                  {e.label && e.labelAt && (
                    <text x={e.labelAt[0]} y={e.labelAt[1]} fontSize={11} fill="#36413a" textAnchor="middle">
                      {e.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
            {model.nodes.map((n) => (
              <NodeView key={n.id} node={n} selected={n.id === selectedId} onSelect={() => onSelect(n.id)} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 text-right text-[10.5px] text-muted">Powered by bpmn.io</div>
    </section>
  );
};
