/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState } from "react";

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

export const notifyDevice = async (title: string, body: string, url: string, tag: string) => {
  if (!notificationsSupported() || Notification.permission !== "granted" || document.visibilityState === "visible")
    return;
  const reg = await navigator.serviceWorker.getRegistration();
  const options = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url } };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
};
