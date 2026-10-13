// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { X } from "lucide-react";
import { Link } from "react-router";
import { smallPrimaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { COMPANY_STYLE } from "../mock";
import type { MapSite } from "../types";
import { CompanyShape } from "./CompanyShape";

/** Nhãn trạng thái của cơ sở trong popup. */
const StatusTag = ({ site }: { site: MapSite }) => {
  const critical = site.alerts.filter((a) => a.status === "critical");
  const warning = site.alerts.filter((a) => a.status === "warning");
  if (critical.length) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11.5px] font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
        {critical.length} nguy cấp · {critical.map((a) => a.code).join(", ")}
      </span>
    );
  }
  if (warning.length) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-medium text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        {warning.length} cảnh báo · {warning.map((a) => a.code).join(", ")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bamboo-50 px-2.5 py-0.5 text-[11.5px] font-medium text-bamboo-700">
      <span className="h-1.5 w-1.5 rounded-full bg-bamboo-500" aria-hidden />
      Bình thường
    </span>
  );
};

/** Popup chi tiết, mũi tên chỉ xuống điểm. */
const MapPopup = ({ site, below, onClose }: { site: MapSite; below: boolean; onClose: () => void }) => (
  <div
    role="dialog"
    aria-label={site.name}
    className={cn(
      "absolute left-1/2 z-20 w-[248px] -translate-x-1/2 rounded-2xl border border-line bg-white p-4 text-left shadow-float",
      below ? "top-full mt-4" : "bottom-full mb-4",
    )}
    onPointerDown={(e) => e.stopPropagation()}
  >
    <div className="flex items-start justify-between gap-2">
      <h3 className="text-[13.5px] font-semibold leading-snug text-ink">{site.name}</h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="-mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
    <div className="mt-1.5">
      <StatusTag site={site} />
    </div>
    <dl className="m-0 mt-3 grid grid-cols-2 gap-3">
      <div>
        <dt className="text-[11.5px] text-muted">Thiết bị</dt>
        <dd className="m-0 text-[17px] font-semibold tabular-nums text-ink">{site.devices}</dd>
      </div>
      <div>
        <dt className="text-[11.5px] text-muted">Hồ sơ mở</dt>
        <dd className="m-0 text-[17px] font-semibold tabular-nums text-ink">{site.openRecords}</dd>
      </div>
    </dl>
    <div className="mt-3 flex items-center gap-2">
      <Link to={`/d/twin?site=${site.id}`} className={smallPrimaryButtonClass}>
        Bản sao số
      </Link>
      <Link
        to="/p/records"
        className="inline-flex h-8 items-center rounded-full px-2.5 text-[12.5px] font-semibold text-ink hover:bg-canvas"
      >
        Hồ sơ liên quan
      </Link>
    </div>
    {/* Mũi tên chỉ về điểm */}
    <span
      aria-hidden
      className={cn(
        "absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white",
        below
          ? "bottom-full translate-y-1.5 border-l border-t border-line"
          : "top-full -translate-y-1.5 border-b border-r border-line",
      )}
    />
  </div>
);

/**
 * Một điểm trên bản đồ. Đặt theo % của lớp bản đồ; tự thu ngược tỉ lệ zoom (`1/zoom`) để điểm và popup
 * giữ nguyên kích thước khi phóng to. Cụm (cluster) hiện số, tách thành từng điểm khi zoom ≥ 1,75.
 */
export const SiteMarker = ({
  site,
  zoom,
  open,
  onToggle,
  onClose,
}: {
  site: MapSite;
  zoom: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) => {
  const critical = site.alerts.some((a) => a.status === "critical");
  const expanded = site.cluster && zoom >= 1.75;

  return (
    <div
      className={cn("absolute", open ? "z-30" : "z-10")}
      style={{ left: `${site.x}%`, top: `${site.y}%`, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
    >
      {expanded && site.cluster
        ? site.cluster.map((p) => (
            <span
              key={p.name}
              title={p.name}
              className="absolute"
              style={{ left: `${p.dx * 6 * zoom}px`, top: `${p.dy * 6 * zoom}px`, transform: "translate(-50%, -50%)" }}
            >
              <CompanyShape company={site.company} size={10} />
            </span>
          ))
        : null}

      <button
        type="button"
        onClick={onToggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-expanded={open}
        aria-label={`${site.name}${site.cluster ? ` (${site.cluster.length} điểm)` : ""}${critical ? " — có cảnh báo nguy cấp" : ""}`}
        className={cn(
          "relative grid place-items-center rounded-full transition-transform hover:scale-110",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
          site.cluster ? "h-8 w-8" : "h-9 w-9",
          expanded && "opacity-60",
        )}
      >
        {critical && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-400/25 motion-safe:animate-ping" aria-hidden />
            <span className="absolute inset-0 rotate-45 rounded-md bg-red-500/15 ring-1 ring-red-300" aria-hidden />
          </>
        )}
        {site.cluster ? (
          <span
            className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold text-white ring-[3px] ring-white shadow-card"
            style={{ background: COMPANY_STYLE[site.company].color }}
          >
            {site.cluster.length}
          </span>
        ) : (
          <span className="relative">
            <CompanyShape company={site.company} size={site.company === "chip" ? 18 : 15} />
          </span>
        )}
      </button>

      {/* Điểm sát mép trên thì mở popup xuống dưới để không bị cắt. */}
      {open && <MapPopup site={site} below={site.y < 38} onClose={onClose} />}
    </div>
  );
};
