// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import Keycloak from "keycloak-js"; // Keycloak JS

// ===== Module nội bộ =====
import { config } from "../config";

// ===== Khởi tạo =====
// Keycloak của dự án: realm bms, client công khai bms-web dùng PKCE (ADR #32).
export const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClient,
});
