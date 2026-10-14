// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ThemeConfig } from "antd";

export const bambooTableTheme: ThemeConfig = {
  components: {
    Table: {
      headerBg: "transparent",
      headerColor: "#6b7670",
      headerSplitColor: "transparent",
      borderColor: "#eef1ee",
      rowHoverBg: "#f5f8f5",
      cellPaddingBlockSM: 10,
      cellPaddingInlineSM: 8,
      cellFontSizeSM: 13,
      headerBorderRadius: 0,
    },
  },
};
