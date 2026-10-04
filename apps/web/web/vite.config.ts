// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Thư viện gom vào một chunk `vendor`, tách khỏi mã ứng dụng: đổi mã ứng dụng không làm trình duyệt
// tải lại thư viện. Không chia nhỏ vendor theo gói: React, antd, Refine tham chiếu lẫn nhau, chia
// ra làm react-dom chạy trước react ở bản build (trang trắng).
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("node_modules") ? "vendor" : undefined),
      },
    },
  },
});
