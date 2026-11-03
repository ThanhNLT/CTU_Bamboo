// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from "react";

import type { ModuleOverview } from "./api";

export type ModulesValue = {
  overview?: ModuleOverview;
  /** Đã hỏi xong máy chủ (thành công hay lỗi); trang của mô-đun chờ cờ này để không gọi API của mô-đun đang tắt */
  ready: boolean;
  /** Mô-đun đã bật cho công ty; không truyền mã (phần lõi) là luôn bật. Chưa tải xong thì coi như bật để menu không nhấp nháy. */
  enabled: (code?: string) => boolean;
  update: (overview: ModuleOverview) => void;
  reload: () => Promise<void>;
};

export const ModulesContext = createContext<ModulesValue>({
  ready: true,
  enabled: () => true,
  update: () => {},
  reload: async () => {},
});

export const useModules = () => useContext(ModulesContext);
