/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { cn } from "../../../utils/cn";
import type { OpsSite } from "../api";
import { ARCHIPELAGOS, project, VN_HEIGHT, VN_PATH, VN_WIDTH } from "../vietnam";
import { ChartWidget, ChipButton } from "./ChartWidget";
import { tr, trf } from "../../../i18n";

const STATUS: Record<OpsSite["status"], { label: string; bg: string; text: string }> = {
  ok: { label: tr("Bình thường"), bg: "bg-bamboo-600", text: "text-bamboo-700" },
  warning: { label: tr("Cần chú ý"), bg: "bg-amber-500", text: "text-amber-700" },
  critical: { label: tr("Quá hạn"), bg: "bg-red-500", text: "text-red-700" },
};
const HEIGHT = 280;
const PAD = 26;

type Box = { x: number; y: number; w: number; h: number };

const ISLANDS = ARCHIPELAGOS.map((a) => ({ ...a, ...project(a.lat, a.lng) }));
const ISLAND_BOUNDS = ISLANDS.flatMap((p) => [
  { x: p.x - 30, y: p.y - 6 },
  { x: p.x + 30, y: p.y + 28 },
]);

const fitBox = (points: { x: number; y: number }[], aspect: number, whole: boolean): Box => {
  let b: Box = { x: 0, y: 0, w: VN_WIDTH, h: VN_HEIGHT };
  if (!whole && points.length > 0) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs) - PAD;
    const y0 = Math.min(...ys) - PAD;
    b = { x: x0, y: y0, w: Math.max(...xs) + PAD - x0, h: Math.max(...ys) + PAD - y0 };
  }
  const x0 = Math.min(b.x, ...ISLAND_BOUNDS.map((p) => p.x));
  const y0 = Math.min(b.y, ...ISLAND_BOUNDS.map((p) => p.y));
  const x1 = Math.max(b.x + b.w, ...ISLAND_BOUNDS.map((p) => p.x));
  const y1 = Math.max(b.y + b.h, ...ISLAND_BOUNDS.map((p) => p.y));
  b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const w = b.w / b.h < aspect ? b.h * aspect : b.w;
  const h = w / aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
};

const Marker = ({
  site,
  left,
  top,
  selected,
  onSelect,
}: {
  site: OpsSite;
  left: number;
  top: number;
  selected: boolean;
  onSelect: () => void;
}) => {
  const st = STATUS[site.status];
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
      {site.status === "critical" && (
        <span
          className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-ui bg-red-400/30 motion-safe:animate-ping"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${site.name} (${site.province ?? tr("chưa ghi tỉnh")}): ${st.label}${site.alerts.length ? ` — ${site.alerts.join("; ")}` : ""}`}
        className={cn(
          "relative grid h-7 w-7 place-items-center rounded-ui transition-colors",
          "focus-visible:outline-2 focus-visible:outline-bamboo-500",
          selected ? "bg-surface shadow-card ring-2 ring-bamboo-200" : "hover:bg-surface/70",
        )}
      >
        <span className={cn("block h-3 w-3", site.subsidiary ? "rounded-ui" : "rounded-ui", st.bg)} />
      </button>
      <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 whitespace-nowrap text-[10.5px] font-medium text-ink/80">
        {site.province ?? site.name}
      </span>
    </div>
  );
};

export const SiteMapWidget = ({ sites, loading }: { sites: OpsSite[]; loading?: boolean }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [whole, setWhole] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => sites.map((s) => ({ site: s, ...project(s.lat, s.lng) })), [sites]);
  const box = fitBox(points, width / HEIGHT, whole);
  const pct = (x: number, y: number) => ({ left: ((x - box.x) / box.w) * 100, top: ((y - box.y) / box.h) * 100 });
  const selected =
    selectedId === undefined
      ? (sites.find((s) => s.status === "critical") ?? sites.find((s) => s.status === "warning"))
      : sites.find((s) => s.id === selectedId);

  return (
    <ChartWidget
      title={tr("Cơ sở và cảnh báo")}
      meta={
        <ChipButton pressed={whole} onClick={() => setWhole((w) => !w)}>
          {tr("Toàn quốc")}
        </ChipButton>
      }
      footer={
        <ul
          className="m-0 flex w-full list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-[11.5px] text-body"
          aria-label={tr("Chú giải")}
        >
          {(Object.keys(STATUS) as OpsSite["status"][]).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-ui", STATUS[k].bg)} aria-hidden />
              {STATUS[k].label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-ui bg-gray-500" aria-hidden />
            {tr("Tenant con (số tổng hợp)")}
          </li>
          <li className="ml-auto">
            <Link to="/admin/org" className="font-semibold text-bamboo-700 underline-offset-2 hover:underline">
              {tr("Thêm tọa độ cơ sở")}
            </Link>
          </li>
        </ul>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div
          ref={boxRef}
          className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-line/70 bg-[#eef4f7]"
          style={{ height: HEIGHT }}
          onClick={(e) => e.target === e.currentTarget && setSelectedId("")}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d={VN_PATH} fill="#f7f9f4" stroke="#b9c7bc" strokeWidth={box.w / width} />
            {ISLANDS.map((p) => (
              <g key={p.name}>
                {[-4, 0, 4].map((d) => (
                  <circle key={d} cx={p.x + d} cy={p.y + (d ? 2 : -2)} r={0.9} fill="#9fb2a4" />
                ))}
              </g>
            ))}
          </svg>
          {ISLANDS.map((p) => {
            const at = pct(p.x, p.y);
            const half = p.name.length * 3 + 6;
            const left = Math.min(Math.max((at.left / 100) * width, half), width - half);
            return (
              <span
                key={p.name}
                className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] font-medium text-[#5f6b64]"
                style={{ left, top: `calc(${at.top}% + 7px)` }}
              >
                {p.name}
              </span>
            );
          })}
          {points.map(({ site, x, y }) => (
            <Marker
              key={site.id}
              site={site}
              {...pct(x, y)}
              selected={site.id === selected?.id}
              onSelect={() => setSelectedId(site.id === selected?.id ? "" : site.id)}
            />
          ))}
          {!loading && sites.length === 0 && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-[12.5px] text-muted">
              {tr("Chưa có đơn vị nào có tọa độ. Quản trị nhập tỉnh và tọa độ cơ sở ở Cơ cấu tổ chức.")}
            </p>
          )}
        </div>
        {sites.length > 0 && (
          <ul
            className="m-0 flex max-h-[280px] list-none flex-col gap-1 overflow-y-auto p-0 sm:w-[220px]"
            aria-label={tr("Danh sách cơ sở")}
          >
            {sites.map((s) => {
              const st = STATUS[s.status];
              const open = s.id === selected?.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setSelectedId(open ? "" : s.id)}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                      open ? "bg-bamboo-50 ring-1 ring-bamboo-200" : "hover:bg-canvas",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <span
                        className={cn("h-2.5 w-2.5 shrink-0", s.subsidiary ? "rounded-ui" : "rounded-ui", st.bg)}
                        aria-hidden
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="block text-muted">
                      {[s.province, trf("{0} chờ", [s.open_tasks]), trf("{0} quá hạn", [s.overdue_tasks])]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {open &&
                      (s.alerts.length ? (
                        s.alerts.map((a) => (
                          <span key={a} className={cn("block", st.text)}>
                            {a}
                          </span>
                        ))
                      ) : (
                        <span className="block text-bamboo-700">{tr("Không có cảnh báo")}</span>
                      ))}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ChartWidget>
  );
};
