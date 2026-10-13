// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Bản đồ (Dữ liệu số): trái ~75% vùng bản đồ (kéo/phóng, tìm kiếm, popup), phải ~25% lớp bản đồ + cảnh báo.
// Nền là hình giả lập; khi nối thật dùng lớp nền GeoServer nội bộ (chạy được khi không có Internet).

// ===== Thư viện =====
import { App } from "antd"; // Ant Design
import { Download } from "lucide-react"; // Lucide React
import { useMemo, useRef, useState } from "react"; // React
import { useNavigate } from "react-router"; // React Router

// ===== Module nội bộ =====
import { primaryButtonClass, secondaryButtonClass } from "../../components/ui";
import { MapContainer, type MapHandle } from "./components/MapContainer";
import { MapSidebar } from "./components/MapSidebar";
import { exportMapPng } from "./exportMapPng";
import { DEFAULT_LAYERS, MOCK_SITES } from "./mock";
import type { LayerKey, MapSite } from "./types";

// ===== Component =====
export const MapPage = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const mapRef = useRef<MapHandle>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const [exporting, setExporting] = useState(false);

  const visibleSites = useMemo(() => MOCK_SITES.filter((s) => layers[s.layer]), [layers]);

  const exportImage = async () => {
    setExporting(true);
    try {
      await exportMapPng(visibleSites, layers.boundary);
      message.success("Đã xuất ảnh bản đồ.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const focus = (site: MapSite) => mapRef.current?.focusSite(site);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Bản đồ</h1>
          <p className="mt-1 text-[13px] text-muted">
            Cơ sở, tài sản và cảnh báo của tập đoàn · lớp nền GeoServer, chạy được khi không có Internet
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button type="button" onClick={exportImage} disabled={exporting} className={secondaryButtonClass}>
            <Download className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden />
            {exporting ? "Đang xuất…" : "Xuất ảnh"}
          </button>
          <button type="button" onClick={() => navigate("/d/twin")} className={primaryButtonClass}>
            Mở bản sao số
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <MapContainer
          ref={mapRef}
          sites={visibleSites}
          allSites={MOCK_SITES}
          showBoundary={layers.boundary}
          initialOpenId="chip-bn"
          onRevealLayer={(s) => setLayers((l) => ({ ...l, [s.layer]: true }))}
        />
        <MapSidebar
          layers={layers}
          onToggleLayer={(key, on) => setLayers((l) => ({ ...l, [key]: on }))}
          sites={visibleSites}
          onFocusSite={focus}
        />
      </div>
    </div>
  );
};

export default MapPage;
