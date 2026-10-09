// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Tailwind v4: sinh class tiện ích từ src/styles/tailwind.css.
import tailwindcss from "@tailwindcss/vite";

// Thư viện gom vào một chunk `vendor`, tách khỏi mã ứng dụng: đổi mã ứng dụng không làm trình duyệt
// tải lại thư viện. Không chia nhỏ vendor theo gói: React, antd, Refine tham chiếu lẫn nhau, chia
// ra làm react-dom chạy trước react ở bản build (trang trắng). Riêng bpmn-js và các gói chỉ nó dùng
// tách thành chunk `bpmn`, chỉ tải khi mở sơ đồ quy trình (không gói nào trong đó dùng React).
const BPMN = /node_modules\/(@bpmn-io\/diagram-js-ui|bpmn-js|bpmn-moddle|clsx|diagram-js|diagram-js-direct-editing|didi|domify|htm|ids|inherits-browser|min-dash|min-dom|moddle|moddle-xml|object-refs|path-intersection|preact|saxen|tiny-svg)\//;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id) => (BPMN.test(id) ? "bpmn" : id.includes("node_modules") ? "vendor" : undefined),
      },
    },
  },
});