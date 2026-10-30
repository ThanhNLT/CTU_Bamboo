// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ThemeConfig } from "antd";

export const bambooTableTheme: ThemeConfig = {
  components: {
    Table: {
      headerBg: "transparent",
      // Biến CSS để bảng đổi màu theo chế độ sáng/tối
      headerColor: "var(--color-muted)",
      headerSplitColor: "transparent",
      borderColor: "var(--color-line)",
      rowHoverBg: "var(--color-bamboo-50)",
      cellPaddingBlockSM: 10,
      cellPaddingInlineSM: 8,
      cellFontSizeSM: 13,
      headerBorderRadius: 0,
    },
  },
};
