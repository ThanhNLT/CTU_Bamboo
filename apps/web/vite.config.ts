// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BPMN =
  /node_modules\/(@bpmn-io\/diagram-js-ui|bpmn-js|bpmn-moddle|clsx|diagram-js|diagram-js-direct-editing|didi|domify|htm|ids|inherits-browser|min-dash|min-dom|moddle|moddle-xml|object-refs|path-intersection|preact|saxen|tiny-svg)\//;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // bpmn-js một chunk riêng; thư viện khác để Rollup chia theo nơi dùng: thư viện chỉ một trang cần (biểu đồ,
        // trình soạn thảo…) tải cùng trang đó thay vì nằm trong khối tải ngay lúc mở ứng dụng (ADR #67)
        manualChunks: (id) => (BPMN.test(id) ? "bpmn" : undefined),
      },
    },
  },
});
