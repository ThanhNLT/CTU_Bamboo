// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Crosshair, Minus, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../../utils/cn";
import { fold } from "../../../utils/text";
import type { MapSite } from "../types";
import { CompanyShape } from "./CompanyShape";

/** Ô tìm cơ sở/địa chỉ nổi góc trên trái; chọn kết quả để bay tới điểm đó. */
export const MapSearch = ({ sites, onPick }: { sites: MapSite[]; onPick: (site: MapSite) => void }) => {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => {
    const k = fold(q.trim());
    return k ? sites.filter((s) => fold(`${s.name} ${s.address}`).includes(k)).slice(0, 6) : [];
  }, [q, sites]);

  return (
    <div className="absolute left-4 top-4 z-40 w-[min(320px,calc(100%-96px))]" onPointerDown={(e) => e.stopPropagation()}>
      <label className="relative block">
        <span className="sr-only">Tìm cơ sở, địa chỉ</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              onPick(results[0]);
              setQ("");
            }
          }}
          placeholder="Tìm cơ sở, địa chỉ"
          className="h-10 w-full rounded-xl border border-line bg-white/95 pl-10 pr-9 text-[13px] text-ink shadow-float outline-none backdrop-blur placeholder:text-muted focus:border-bamboo-400 focus:ring-3 focus:ring-bamboo-100 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Xóa"
                  className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-canvas">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      {focused && q.trim() && (
        <ul className="m-0 mt-1.5 list-none overflow-hidden rounded-xl border border-line bg-white p-1 shadow-float" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-muted">Không tìm thấy cơ sở phù hợp.</li>
          ) : (
            results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(s);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas"
                >
                  <span className="grid h-5 w-5 place-items-center"><CompanyShape company={s.company} size={11} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{s.name}</span>
                    <span className="block truncate text-[11.5px] text-muted">{s.address}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

const btn =
  "grid h-9 w-9 place-items-center text-body transition-colors hover:bg-canvas disabled:cursor-default disabled:opacity-40 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bamboo-500";

/** Nhóm nút nổi góc trên phải: phóng to, thu nhỏ, về toàn cảnh. */
export const MapFloatingControls = ({
  zoom, min, max, onZoomIn, onZoomOut, onReset,
}: {
  zoom: number;
  min: number;
  max: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) => (
  <div
    className="absolute right-4 top-4 z-40 flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-float"
    onPointerDown={(e) => e.stopPropagation()}
  >
    <button type="button" className={btn} onClick={onZoomIn} disabled={zoom >= max} aria-label="Phóng to"><Plus className="h-4 w-4" /></button>
    <span className="mx-2 h-px bg-line" aria-hidden />
    <button type="button" className={btn} onClick={onZoomOut} disabled={zoom <= min} aria-label="Thu nhỏ"><Minus className="h-4 w-4" /></button>
    <span className="mx-2 h-px bg-line" aria-hidden />
    <button type="button" className={cn(btn)} onClick={onReset} aria-label="Về toàn cảnh" title="Về toàn cảnh"><Crosshair className="h-4 w-4" /></button>
  </div>
);
