// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { type PropsWithChildren, useEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";

import { ColorModeContext } from "./context";

const BAMBOO_TOKENS = {
  colorPrimary: "#2f7a3e",
  colorInfo: "#2f7a3e",
  colorSuccess: "#3f9150",
  colorLink: "#276533",
  colorText: "#1b231e",
  colorTextSecondary: "#6b7670",
  colorBorder: "#e4e9e5",
  colorBorderSecondary: "#eef1ee",
  colorBgLayout: "#f5f7f5",
  borderRadius: 10,
  fontFamily:
    '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [mode, setMode] = useState("light");

  useEffect(() => {
    try {
      window.localStorage.setItem("colorMode", mode);
    } catch {}
  }, [mode]);

  const setColorMode = () => {
    if (mode === "light") {
      setMode("dark");
    } else {
      setMode("light");
    }
  };

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
          token: BAMBOO_TOKENS,
          components: {
            Segmented: { trackBg: "#eef1ee", itemSelectedBg: "#ffffff", itemColor: "#6b7670" },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};
