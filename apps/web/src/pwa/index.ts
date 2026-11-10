/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useEffect, useState } from "react";

/**
 * Ứng dụng web cho thiết bị di động (ADR #65): đăng ký service worker (public/sw.js), lời mời cài ứng dụng lên màn hình
 * chính và thông báo trên thiết bị khi ứng dụng đang chạy nền. Không dùng dịch vụ đẩy tin bên ngoài (Web Push cần máy
 * chủ trung gian của Google/Apple): thông báo chỉ hiện khi ứng dụng còn mở ở nền; thư điện tử/SMS vẫn là kênh khi tắt hẳn.
 */
export const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
};

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Trình duyệt cho cài ứng dụng (Chrome, Edge, Samsung Internet) thì trả hàm cài; iOS cài bằng "Thêm vào MH chính". */
export const useInstall = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (!deferred || isStandalone()) return null;
  return async () => {
    const prompt = deferred;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferred = null;
    listeners.forEach((l) => l());
  };
};

export const notificationsSupported = () => "Notification" in window && "serviceWorker" in navigator;

export const askNotifications = async () => {
  if (!notificationsSupported()) return "unsupported" as const;
  return Notification.requestPermission();
};

/** Hiện thông báo của hệ điều hành khi tab đang ẩn và người dùng đã cho phép. */
export const notifyDevice = async (title: string, body: string, url: string, tag: string) => {
  if (!notificationsSupported() || Notification.permission !== "granted" || document.visibilityState === "visible")
    return;
  const reg = await navigator.serviceWorker.getRegistration();
  const options = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url } };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
};
