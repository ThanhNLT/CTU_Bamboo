// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { type PropsWithChildren, useEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";

import { ColorModeContext } from "./context";

const STORAGE_KEY = "colorMode";

const SHARED_TOKENS = {
  colorPrimary: "#2f7a3e",
  colorInfo: "#2f7a3e",
  // Một bán kính 10px cho mọi thành phần (ô nhập, nút, thẻ, modal, menu...)
  borderRadius: 10,
  borderRadiusLG: 10,
  borderRadiusSM: 10,
  borderRadiusXS: 10,
  borderRadiusOuter: 10,
  fontFamily:
    '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

// Giá trị khớp token Tailwind trong styles/tailwind.css (:root và :root[data-theme="dark"])
const MODE_TOKENS = {
  light: {
    colorSuccess: "#3e8a4f",
    colorLink: "#1f5e2e",
    colorText: "#1b231e",
    colorTextSecondary: "#6b7670",
    colorBorder: "#e4e9e5",
    colorBorderSecondary: "#eef1ee",
    colorBgLayout: "#f5f7f5",
  },
  dark: {
    colorSuccess: "#5fae6e",
    colorLink: "#6dbb7c",
    colorText: "#e8efe9",
    colorTextSecondary: "#8b978f",
    colorBorder: "#2a352e",
    colorBorderSecondary: "#222b25",
    colorBgLayout: "#0f1511",
    colorBgContainer: "#18201b",
    colorBgElevated: "#1d2620",
    // Chữ phụ của Ant Design (ô trống, chú thích) mặc định chỉ 25–45% độ đậm: nâng lên đạt tương phản 4,5:1
    colorTextTertiary: "#a7b1aa",
    colorTextQuaternary: "#8b978f",
    colorTextPlaceholder: "#8b978f",
  },
};

const MODE_COMPONENTS = {
  light: {
    Segmented: { trackBg: "#eef1ee", itemSelectedBg: "#ffffff", itemColor: "#6b7670" },
    Menu: { itemSelectedBg: "#2f7a3e", itemSelectedColor: "#ffffff", itemHoverBg: "#e8f3e8" },
    Tag: { defaultBg: "#f1f8f2" },
  },
  dark: {
    Segmented: { trackBg: "#0f1511", itemSelectedBg: "#34413a", itemColor: "#c3cdc6", itemSelectedColor: "#ffffff" },
    Menu: { itemSelectedBg: "#2f7a3e", itemSelectedColor: "#ffffff", itemHoverBg: "#1a2e21" },
    Tag: { defaultBg: "#15241a" },
    Pagination: { itemActiveBg: "#2f7a3e", itemActiveColor: "#ffffff", itemActiveColorHover: "#ffffff" },
  },
};

// Bamboo Glass: nút và thanh phân đoạn dạng viên thuốc, hộp thoại và thẻ bo rộng (dùng chung cho mọi trang)
const SHARED_COMPONENTS = {
  Button: { borderRadius: 999, borderRadiusLG: 999, borderRadiusSM: 999, fontWeight: 500 },
  Segmented: { borderRadius: 999, borderRadiusSM: 999, borderRadiusXS: 999, borderRadiusLG: 999 },
  Card: { borderRadiusLG: 20 },
  Modal: { borderRadiusLG: 22 },
  Tag: { borderRadiusSM: 999 },
};

const mergeComponents = (byMode: Record<string, object>) => {
  const out: Record<string, object> = { ...SHARED_COMPONENTS };
  for (const [k, v] of Object.entries(byMode)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
};

type Mode = keyof typeof MODE_TOKENS;

// Lần đầu theo cài đặt hệ điều hành; sau đó theo lựa chọn người dùng đã lưu
const readMode = (): Mode => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [mode, setMode] = useState<Mode>(readMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  const setColorMode = () => setMode((m) => (m === "light" ? "dark" : "light"));

  const { darkAlgorithm, defaultAlgorithm } = theme;

  return (
    <ColorModeContext.Provider
      value={{
        setMode: setColorMode,
        mode,
      }}
    >
      <ConfigProvider
        theme={{
          algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
          token: { ...SHARED_TOKENS, ...MODE_TOKENS[mode] },
          components: mergeComponents(MODE_COMPONENTS[mode]),
        }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};
