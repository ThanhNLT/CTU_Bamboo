// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import type { ThemeConfig } from "antd"; // Ant Design

// ===== Hằng số =====
/** Bảng AntD kiểu Bamboo: tiêu đề trong suốt chữ xám, đường kẻ mảnh, hàng thoáng. Dùng với <ConfigProvider theme>. */
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
