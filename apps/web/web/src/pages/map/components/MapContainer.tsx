// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Vùng bản đồ: nền SVG + điểm định vị tuyệt đối trong một lớp có thể kéo (pan) và phóng (zoom).
// Ô tìm kiếm, nút nổi, chú giải và dòng ghi nguồn nằm ngoài lớp đó nên không bị phóng theo.
// Trang cha gọi `focusSite(site)` (qua ref) để bay tới một cơ sở và mở popup của nó.
import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent } from "react";
import { cn } from "../../../utils/cn";
import { ATTRIBUTION, COMPANY_STYLE } from "../mock";
import type { CompanyKey, MapSite, MapView } from "../types";
import { CompanyShape } from "./CompanyShape";
import { MapBackdrop } from "./MapBackdrop";
import { MapFloatingControls, MapSearch } from "./MapFloatingControls";
import { SiteMarker } from "./SiteMarker";

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const FOCUS_ZOOM = 1.75;

export type MapHandle = { focusSite: (site: MapSite) => void };

const Legend = () => (
  <ul
    className="absolute bottom-4 left-4 z-30 m-0 flex list-none flex-wrap items-center gap-x-3.5 gap-y-1 rounded-full border border-line bg-white/95 px-3.5 py-2 text-[11.5px] text-body shadow-float backdrop-blur"
    aria-label="Chú giải"
  >
    {(Object.keys(COMPANY_STYLE) as CompanyKey[]).map((k) => (
      <li key={k} className="inline-flex items-center gap-1.5">
        <span className="grid h-3.5 w-3.5 place-items-center">
          <CompanyShape company={k} size={9} />
        </span>
        {COMPANY_STYLE[k].name}
      </li>
    ))}
  </ul>
);

/** Giới hạn kéo để không lộ khoảng trống ngoài bản đồ. */
const clampPan = (v: MapView, w: number, h: number): MapView => {
  const mx = ((v.zoom - 1) * w) / 2;
  const my = ((v.zoom - 1) * h) / 2;
  return { ...v, panX: Math.max(-mx, Math.min(mx, v.panX)), panY: Math.max(-my, Math.min(my, v.panY)) };
};

export const MapContainer = forwardRef<
  MapHandle,
  {
    /** Các điểm thuộc lớp đang bật. */
    sites: MapSite[];
    /** Mọi điểm (để tìm kiếm cả khi lớp đang tắt). */
    allSites: MapSite[];
    showBoundary: boolean;
    /** Điểm mở popup sẵn khi vào trang. */
    initialOpenId?: string;
    /** Tìm thấy một điểm ở lớp đang tắt → trang cha bật lớp đó. */
    onRevealLayer: (site: MapSite) => void;
  }
>(({ sites, allSites, showBoundary, initialOpenId, onRevealLayer }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<MapView>({ zoom: 1, panX: 0, panY: 0 });
  const [openId, setOpenId] = useState<string | undefined>(initialOpenId);

  const box = () => ({ w: rootRef.current?.clientWidth ?? 0, h: rootRef.current?.clientHeight ?? 0 });

  const zoomTo = (zoom: number) => {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
    const k = z / view.zoom; // giữ tâm màn hình cố định khi phóng
    const { w, h } = box();
    setView(clampPan({ zoom: z, panX: view.panX * k, panY: view.panY * k }, w, h));
  };

  const focusSite = (site: MapSite) => {
    const { w, h } = box();
    const zoom = Math.max(view.zoom, FOCUS_ZOOM);
    // Lớp bản đồ phóng quanh tâm: đưa điểm (x%, y%) về giữa khung.
    setView(clampPan({ zoom, panX: (0.5 - site.x / 100) * w * zoom, panY: (0.5 - site.y / 100) * h * zoom }, w, h));
    setOpenId(site.id);
    if (!sites.some((s) => s.id === site.id)) onRevealLayer(site);
  };

  useImperativeHandle(ref, () => ({ focusSite }));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const { w, h } = box();
    setView(clampPan({ zoom: view.zoom, panX: d.panX + e.clientX - d.x, panY: d.panY + e.clientY - d.y }, w, h));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    // Bấm (không kéo) vào nền thì đóng popup.
    if (d && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4) setOpenId(undefined);
  };

  // Popup của điểm vừa bị tắt lớp thì không hiện.
  const visibleOpenId = sites.some((s) => s.id === openId) ? openId : undefined;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative h-[calc(100dvh-210px)] min-h-[520px] touch-none select-none overflow-hidden rounded-2xl border border-line bg-[#eef2ee] shadow-card",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      role="application"
      aria-label="Bản đồ cơ sở và cảnh báo. Kéo để di chuyển; nút cộng/trừ để phóng."
    >
      <div
        className="absolute inset-0 origin-center"
        style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}
      >
        <MapBackdrop showBoundary={showBoundary} />
        {sites.map((s) => (
          <SiteMarker
            key={s.id}
            site={s}
            zoom={view.zoom}
            open={s.id === visibleOpenId}
            onToggle={() => setOpenId(s.id === openId ? undefined : s.id)}
            onClose={() => setOpenId(undefined)}
          />
        ))}
      </div>

      <MapSearch sites={allSites} onPick={focusSite} />
      <MapFloatingControls
        zoom={view.zoom}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        onZoomIn={() => zoomTo(view.zoom + 0.5)}
        onZoomOut={() => zoomTo(view.zoom - 0.5)}
        onReset={() => setView({ zoom: 1, panX: 0, panY: 0 })}
      />
      <Legend />
      <div className="pointer-events-none absolute bottom-3 right-4 z-30 text-[10.5px] text-muted">{ATTRIBUTION}</div>
    </div>
  );
});
MapContainer.displayName = "MapContainer";
