// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { createRoot } from "react-dom/client";

import Keycloak from "keycloak-js";
import { ReactKeycloakProvider } from "@react-keycloak/web";

import App from "./App";

// Keycloak của dự án (realm bms, client bms-web dùng PKCE – ADR #32). Đổi qua biến môi trường Vite.
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "bms",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT ?? "bms-web",
});

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <ReactKeycloakProvider authClient={keycloak} initOptions={{ pkceMethod: "S256" }}>
    <App />
  </ReactKeycloakProvider>
);
