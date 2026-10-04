// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import Keycloak from "keycloak-js";
import { config } from "../config";

// Keycloak của dự án: realm bms, client công khai bms-web dùng PKCE (ADR #32).
export const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClient,
});
