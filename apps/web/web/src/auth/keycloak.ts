// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import Keycloak from "keycloak-js";

// Keycloak của dự án: realm bms, client công khai bms-web dùng PKCE (ADR #32).
export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "bms",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT ?? "bms-web",
});
