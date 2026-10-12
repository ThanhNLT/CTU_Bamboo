// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hàng đợi tải lên MÔ PHỎNG: tăng tiến độ → quét mã độc → kết quả. Khi nối API thật, thay phần
// setInterval bằng sự kiện onUploadProgress của request và trạng thái kiểm dịch trả về từ máy chủ.
import { useCallback, useEffect, useState } from "react";
import type { UploadItem } from "./types";

const TICK_MS = 500;
const SCAN_TICKS = 16; // ~8 giây quét mã độc

type QueueItem = UploadItem & { scanTicks: number };

const step = (item: QueueItem): QueueItem => {
  if (item.status === "uploading") {
    const progress = Math.min(100, item.progress + 2);
    return { ...item, progress, status: progress >= 100 ? "scanning" : "uploading" };
  }
  if (item.status === "scanning") {
    const scanTicks = item.scanTicks + 1;
    if (scanTicks < SCAN_TICKS) return { ...item, scanTicks };
    // Minh họa: tệp có "virus"/"eicar" trong tên sẽ bị chặn.
    return { ...item, scanTicks, status: /virus|eicar/i.test(item.name) ? "blocked" : "clean" };
  }
  return item;
};

export const useUploadQueue = (initial: UploadItem[] = []) => {
  const [items, setItems] = useState<QueueItem[]>(() => initial.map((i) => ({ ...i, scanTicks: 0 })));
  const active = items.some((i) => i.status === "uploading" || i.status === "scanning");

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setItems((prev) => prev.map(step)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  const enqueue = useCallback((files: FileList | File[]) => {
    const stamp = Date.now();
    const added: QueueItem[] = Array.from(files).map((f, i) => ({
      id: `${stamp}-${i}-${f.name}`,
      name: f.name,
      progress: 0,
      status: "uploading",
      scanTicks: 0,
    }));
    setItems((prev) => [...prev, ...added]);
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "uploading" || i.status === "scanning"));
  }, []);

  return { items: items as UploadItem[], enqueue, clearFinished, active };
};
