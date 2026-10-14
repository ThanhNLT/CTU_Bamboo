// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// "Cơ sở và cảnh báo": các đơn vị có tọa độ (quản trị nhập ở Cơ cấu tổ chức) trên nền bản đồ Việt Nam đóng gói sẵn
// (chạy được khi không có Internet). Màu = mức cảnh báo tính ở máy chủ: đỏ khi có việc duyệt quá hạn, vàng khi có
// việc đang chờ hoặc lô đang giữ. Mặc định phóng vào vùng có cơ sở; "Toàn quốc" để xem cả nước (ADR #49).

// ===== Thư viện =====
import { useEffect, useMemo, useRef, useState } from "react"; // React
import { Link } from "react-router"; // React Router

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import type { OpsSite } from "../api";
import { ARCHIPELAGOS, project, VN_HEIGHT, VN_PATH, VN_WIDTH } from "../vietnam";
import { ChartWidget, ChipButton } from "./ChartWidget";

// ===== Hằng số =====
const STATUS: Record<OpsSite["status"], { label: string; bg: string; text: string }> = {
  ok: { label: "Bình thường", bg: "bg-bamboo-600", text: "text-bamboo-700" },
  warning: { label: "Cần chú ý", bg: "bg-amber-500", text: "text-amber-700" },
  critical: { label: "Quá hạn", bg: "bg-red-500", text: "text-red-700" },
};
const HEIGHT = 280;
const PAD = 26; // khoảng đệm quanh cơ sở khi phóng (đơn vị khung, ~1,3 độ)

// ===== Kiểu dữ liệu =====
type Box = { x: number; y: number; w: number; h: number };

// ===== Hàm tiện ích =====
/** Khung nhìn cùng tỉ lệ với khối: ôm các cơ sở (hoặc cả nước), giữ tâm. */
const fitBox = (points: { x: number; y: number }[], aspect: number, whole: boolean): Box => {
  let b: Box = { x: 0, y: 0, w: VN_WIDTH, h: VN_HEIGHT };
  if (!whole && points.length > 0) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs) - PAD;
    const y0 = Math.min(...ys) - PAD;
    b = { x: x0, y: y0, w: Math.max(...xs) + PAD - x0, h: Math.max(...ys) + PAD - y0 };
  }
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const w = b.w / b.h < aspect ? b.h * aspect : b.w;
  const h = w / aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
};

// ===== Component =====
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
          className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400/30 motion-safe:animate-ping"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${site.name} (${site.province ?? "chưa ghi tỉnh"}): ${st.label}${site.alerts.length ? ` — ${site.alerts.join("; ")}` : ""}`}
        className={cn(
          "relative grid h-7 w-7 place-items-center rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-bamboo-500",
          selected ? "bg-white shadow-card ring-2 ring-bamboo-200" : "hover:bg-white/70",
        )}
      >
        <span className={cn("block h-3 w-3", site.subsidiary ? "rounded-[2px]" : "rounded-full", st.bg)} />
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
  /** undefined: tự chọn cơ sở đáng chú ý nhất; "": người dùng đã đóng. */
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
      title="Cơ sở và cảnh báo"
      meta={
        <ChipButton pressed={whole} onClick={() => setWhole((w) => !w)}>
          Toàn quốc
        </ChipButton>
      }
      footer={
        <ul
          className="m-0 flex w-full list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-[11.5px] text-body"
          aria-label="Chú giải"
        >
          {(Object.keys(STATUS) as OpsSite["status"][]).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", STATUS[k].bg)} aria-hidden />
              {STATUS[k].label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-gray-500" aria-hidden />
            Tenant con (số tổng hợp)
          </li>
          <li className="ml-auto">
            <Link to="/admin/org" className="font-semibold text-bamboo-700 underline-offset-2 hover:underline">
              Thêm tọa độ cơ sở
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
            {ARCHIPELAGOS.map((a) => {
              const p = project(a.lat, a.lng);
              return (
                <g key={a.name}>
                  {[-4, 0, 4].map((d) => (
                    <circle key={d} cx={p.x + d} cy={p.y + (d ? 2 : -2)} r={0.9} fill="#9fb2a4" />
                  ))}
                  {whole && (
                    <text x={p.x} y={p.y + 10} fontSize={6} textAnchor="middle" fill="#6b7670">
                      {a.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
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
              Chưa có đơn vị nào có tọa độ. Quản trị nhập tỉnh và tọa độ cơ sở ở Cơ cấu tổ chức.
            </p>
          )}
        </div>
        {sites.length > 0 && (
          <ul
            className="m-0 flex max-h-[280px] list-none flex-col gap-1 overflow-y-auto p-0 sm:w-[220px]"
            aria-label="Danh sách cơ sở"
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
                        className={cn("h-2.5 w-2.5 shrink-0", s.subsidiary ? "rounded-[2px]" : "rounded-full", st.bg)}
                        aria-hidden
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="block text-muted">
                      {[s.province, `${s.open_tasks} chờ`, `${s.overdue_tasks} quá hạn`].filter(Boolean).join(" · ")}
                    </span>
                    {open &&
                      (s.alerts.length ? (
                        s.alerts.map((a) => (
                          <span key={a} className={cn("block", st.text)}>
                            {a}
                          </span>
                        ))
                      ) : (
                        <span className="block text-bamboo-700">Không có cảnh báo</span>
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
