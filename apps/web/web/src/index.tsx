// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { createRoot } from "react-dom/client"; // React DOM
import { ReactKeycloakProvider } from "@react-keycloak/web"; // React Keycloak

// ===== Module nội bộ =====
import App from "./App";
import { setToken } from "./api/client";
import { keycloak } from "./auth/keycloak";

// ===== Khởi tạo =====
const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <ReactKeycloakProvider
    authClient={keycloak}
    initOptions={{ pkceMethod: "S256", onLoad: "check-sso", checkLoginIframe: false }}
    onTokens={({ token }) => setToken(token)}
  >
    <App />
  </ReactKeycloakProvider>,
);
