/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import type { ThemeConfig } from "antd";

export const bambooTableTheme: ThemeConfig = {
  components: {
    Table: {
      headerBg: "transparent",
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
