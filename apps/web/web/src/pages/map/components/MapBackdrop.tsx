// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nền bản đồ giả lập (SVG): đường phố, sông, công viên, ranh giới hành chính (tùy chọn).
// Cùng một dữ liệu hình (../geometry) được dùng cho ảnh xuất để ảnh giống màn hình.
import { BOUNDARIES, MINOR_ROADS, PARKS, RIVER, ROADS, VIEWBOX } from "../geometry";

export const MapBackdrop = ({ showBoundary }: { showBoundary: boolean }) => (
  <svg
    viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 h-full w-full"
    aria-hidden
  >
    <rect width={VIEWBOX.w} height={VIEWBOX.h} fill="#eef2ee" />
    {PARKS.map((d) => <path key={d} d={d} fill="#d7ead9" />)}
    <path d={RIVER} fill="none" stroke="#cfe2ec" strokeWidth={14} strokeLinecap="round" />
    {MINOR_ROADS.map((d) => <path key={d} d={d} stroke="#ffffff" strokeWidth={4} opacity={0.8} />)}
    {ROADS.map((d) => <path key={d} d={d} stroke="#ffffff" strokeWidth={9} />)}
    {showBoundary &&
      BOUNDARIES.map((d) => (
        <path key={d} d={d} fill="rgba(47,122,62,0.04)" stroke="#6b7670" strokeWidth={1.5} strokeDasharray="8 6" />
      ))}
  </svg>
);
