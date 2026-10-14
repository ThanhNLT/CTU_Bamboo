// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

type RuntimeConfig = Partial<{ keycloakUrl: string; keycloakRealm: string; keycloakClient: string; hasuraUrl: string }>;

const runtime: RuntimeConfig = (window as unknown as { __BAMBOO_CONFIG__?: RuntimeConfig }).__BAMBOO_CONFIG__ ?? {};

const pick = (...values: (string | undefined)[]) => values.find((v) => v && v.trim()) as string;

export const config = {
  keycloakUrl: pick(runtime.keycloakUrl, import.meta.env.VITE_KEYCLOAK_URL, window.location.origin),
  keycloakRealm: pick(runtime.keycloakRealm, import.meta.env.VITE_KEYCLOAK_REALM, "bms"),
  keycloakClient: pick(runtime.keycloakClient, import.meta.env.VITE_KEYCLOAK_CLIENT, "bms-web"),
  hasuraUrl: pick(runtime.hasuraUrl, import.meta.env.VITE_HASURA_URL, `${window.location.origin}/graphql`),
};
