// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tách thư viện lớn thành chunk riêng: đổi mã ứng dụng không làm trình duyệt tải lại vendor.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          antd: ["antd", "@ant-design/icons"],
          refine: ["@refinedev/core", "@refinedev/antd", "@refinedev/hasura", "@refinedev/react-router", "@refinedev/kbar"],
          keycloak: ["keycloak-js", "@react-keycloak/web"],
        },
      },
    },
  },
});
