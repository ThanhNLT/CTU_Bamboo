// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { useEffect, useState } from "react"; // React

// ===== Hook =====
/**
 * Đồng hồ "cập nhật lúc" mô phỏng luồng dữ liệu trực tiếp: cứ `everyMs` lại nhích lên một nhịp.
 * Khi nối luồng NGSI-LD thật (subscription/WebSocket), thay bằng thời điểm của bản tin cuối cùng.
 */
export const useLiveClock = (start: number, everyMs = 5000) => {
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = window.setInterval(() => setNow((t) => t + everyMs), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
};
