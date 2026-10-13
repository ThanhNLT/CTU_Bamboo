// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Kiểu dữ liệu =====
// Thứ tự ưu tiên: cấu hình lúc chạy (/config.js do container sinh) → biến VITE_* lúc build → cùng origin
// với trang (cổng API phục vụ cả giao diện, /realms và /graphql, ADR #34). Nhờ vậy một image dựng sẵn
// chạy được sau mọi tên miền mà không cần cấu hình.
type RuntimeConfig = Partial<{ keycloakUrl: string; keycloakRealm: string; keycloakClient: string; hasuraUrl: string }>;

// ===== Hằng số =====
const runtime: RuntimeConfig = (window as unknown as { __BAMBOO_CONFIG__?: RuntimeConfig }).__BAMBOO_CONFIG__ ?? {};

// ===== Hàm tiện ích =====
const pick = (...values: (string | undefined)[]) => values.find((v) => v && v.trim()) as string;

// ===== Hằng số =====
export const config = {
  keycloakUrl: pick(runtime.keycloakUrl, import.meta.env.VITE_KEYCLOAK_URL, window.location.origin),
  keycloakRealm: pick(runtime.keycloakRealm, import.meta.env.VITE_KEYCLOAK_REALM, "bms"),
  keycloakClient: pick(runtime.keycloakClient, import.meta.env.VITE_KEYCLOAK_CLIENT, "bms-web"),
  hasuraUrl: pick(runtime.hasuraUrl, import.meta.env.VITE_HASURA_URL, `${window.location.origin}/graphql`),
};
