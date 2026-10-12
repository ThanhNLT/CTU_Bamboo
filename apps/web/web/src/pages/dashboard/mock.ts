// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// KPI minh họa cho Trang chủ (chưa có nguồn số liệu KPI). Phần còn lại của trang dùng dữ liệu thật (./useDashboard).
import type { PinnedKpi } from "./types";

export const MOCK_KPIS: PinnedKpi[] = [
  {
    key: "on-time",
    label: "Duyệt đúng hạn · đơn vị",
    value: "92,4%",
    note: "1,1 điểm so với tháng trước",
    noteTone: "danger",
    noteMarker: "down",
    series: [93.9, 93.6, 94.0, 93.7, 93.9, 93.3, 93.5, 93.0, 93.2, 92.7, 92.9, 92.4],
  },
  {
    key: "particles",
    label: "Hạt bụi ≥0,5 µm · CR-02",
    value: "3.120/m³",
    note: "Ngưỡng ISO 5: 3.520",
    noteTone: "warning",
    noteMarker: "dot",
    series: [2840, 2880, 2870, 2930, 2910, 2970, 2990, 2980, 3040, 3060, 3090, 3120],
    threshold: 3520,
  },
];
