// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// "Cơ sở và cảnh báo": bản đồ giả lập bằng nền lưới + điểm định vị tuyệt đối.
// Hình dạng = công ty (vuông/thoi/tròn/chữ thập); màu = mức cảnh báo. Không dùng màu công ty ở đây vì
// 4 màu hiện cùng lúc dạng chấm rời không đủ phân biệt (cam/vàng) — hình dạng gánh phần nhận diện.
import { Link } from "react-router";
import { useState } from "react";
import { cn } from "../../../utils/cn";
import { SAMPLE_COMPANIES as COMPANIES, SAMPLE_COMPANY as COMPANY } from "../sample";
import type { SampleCompanyKey, Site, SiteStatus } from "../types";
import { ChartWidget } from "./ChartWidget";

const STATUS: Record<SiteStatus, { label: string; bg: string; text: string }> = {
  ok: { label: "Bình thường", bg: "bg-gray-500", text: "text-gray-600" },
  warning: { label: "Cảnh báo", bg: "bg-amber-500", text: "text-amber-700" },
  critical: { label: "Nguy cấp", bg: "bg-red-500", text: "text-red-700" },
};

/** Hình đại diện công ty, tô theo mức cảnh báo. */
export const SiteShape = ({
  company,
  colorClass,
  size = 12,
}: {
  company: SampleCompanyKey;
  colorClass: string;
  size?: number;
}) => {
  const s = { width: size, height: size };
  switch (company) {
    case "phone":
      return <span style={s} className={cn("block rounded-[2px]", colorClass)} />;
    case "chip":
      return (
        <span
          style={{ width: size * 0.85, height: size * 0.85 }}
          className={cn("block rotate-45 rounded-[2px]", colorClass)}
        />
      );
    case "appliance":
      return <span style={s} className={cn("block rounded-full", colorClass)} />;
    case "hospital":
      return (
        <span style={s} className="relative block">
          <span className={cn("absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 rounded-[1px]", colorClass)} />
          <span className={cn("absolute left-0 top-1/2 h-[34%] w-full -translate-y-1/2 rounded-[1px]", colorClass)} />
        </span>
      );
  }
};

const Marker = ({
  site,
  selected,
  faded,
  onSelect,
}: {
  site: Site;
  selected: boolean;
  faded: boolean;
  onSelect: () => void;
}) => {
  const st = STATUS[site.status];
  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 transition-opacity",
        faded ? "opacity-25" : "opacity-100",
      )}
      style={{ left: `${site.x}%`, top: `${site.y}%` }}
    >
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
        aria-label={`${COMPANY[site.company].name} · ${site.name} (${site.province}): ${st.label}${site.alert ? ` — ${site.alert}` : ""}`}
        className={cn(
          "relative grid h-7 w-7 place-items-center rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-bamboo-500",
          selected
            ? cn("bg-white shadow-card ring-2", site.status === "critical" ? "ring-red-200" : "ring-bamboo-200")
            : "hover:bg-white/70",
        )}
      >
        <SiteShape company={site.company} colorClass={st.bg} />
      </button>
      {selected && (
        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] shadow-float">
          <div className="font-semibold text-ink">
            {site.name} · <span className={st.text}>{st.label}</span>
          </div>
          <div className="text-muted">{site.alert ?? `${COMPANY[site.company].name} · ${site.province}`}</div>
        </div>
      )}
    </div>
  );
};

export const WarningMapWidget = ({ sites, highlight }: { sites: Site[]; highlight?: SampleCompanyKey }) => {
  // Mặc định mở điểm nguy cấp nhất để người xem thấy ngay.
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => sites.find((s) => s.status === "critical")?.id,
  );

  return (
    <ChartWidget
      title="Cơ sở và cảnh báo"
      meta={
        <span className="inline-flex items-center gap-2">
          <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[11px] font-medium text-muted">Minh họa</span>
          <Link to="/d/map" className="font-semibold text-bamboo-700 hover:underline underline-offset-2">
            Mở bản đồ
          </Link>
        </span>
      }
      footer={
        <ul
          className="m-0 flex w-full list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-[11.5px] text-body"
          aria-label="Chú giải"
        >
          {COMPANIES.map((c) => (
            <li key={c.key} className="inline-flex items-center gap-1.5">
              <SiteShape company={c.key} colorClass="bg-ink/70" size={10} />
              {c.name}
            </li>
          ))}
          <li className="ml-auto inline-flex items-center gap-3">
            {(Object.keys(STATUS) as SiteStatus[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-full", STATUS[k].bg)} aria-hidden />
                {STATUS[k].label}
              </span>
            ))}
          </li>
        </ul>
      }
    >
      <div
        className="relative h-[260px] overflow-hidden rounded-xl border border-line/70 bg-[#f7f9f7] bg-[linear-gradient(to_right,rgb(16_24_20/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(16_24_20/0.06)_1px,transparent_1px)] bg-[length:22px_22px]"
        onClick={(e) => e.target === e.currentTarget && setSelectedId(undefined)}
      >
        {sites.map((s) => (
          <Marker
            key={s.id}
            site={s}
            selected={s.id === selectedId}
            faded={Boolean(highlight && highlight !== s.company)}
            onSelect={() => setSelectedId(s.id === selectedId ? undefined : s.id)}
          />
        ))}
        {sites.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-[12.5px] text-muted">
            Không có cơ sở nào theo bộ lọc.
          </p>
        )}
      </div>
    </ChartWidget>
  );
};
