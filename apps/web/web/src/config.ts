// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thứ tự ưu tiên: cấu hình lúc chạy (/config.js do container sinh) → biến VITE_* lúc build → mặc định
// cho stack docker compose trên máy dev. Nhờ vậy một image dựng sẵn chạy được trên mọi tên miền.
type RuntimeConfig = Partial<{ keycloakUrl: string; keycloakRealm: string; keycloakClient: string; hasuraUrl: string }>;

const runtime: RuntimeConfig = (window as unknown as { __BAMBOO_CONFIG__?: RuntimeConfig }).__BAMBOO_CONFIG__ ?? {};
const pick = (...values: (string | undefined)[]) => values.find((v) => v && v.trim()) as string;

export const config = {
  keycloakUrl: pick(runtime.keycloakUrl, import.meta.env.VITE_KEYCLOAK_URL, "http://localhost:8080"),
  keycloakRealm: pick(runtime.keycloakRealm, import.meta.env.VITE_KEYCLOAK_REALM, "bms"),
  keycloakClient: pick(runtime.keycloakClient, import.meta.env.VITE_KEYCLOAK_CLIENT, "bms-web"),
  hasuraUrl: pick(runtime.hasuraUrl, import.meta.env.VITE_HASURA_URL, "http://localhost:8081/v1/graphql"),
};
