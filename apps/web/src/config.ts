/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

type RuntimeConfig = Partial<{
  keycloakUrl: string;
  keycloakRealm: string;
  keycloakClient: string;
  hasuraUrl: string;
  setupUrl: string;
  extUrl: string;
}>;

const runtime: RuntimeConfig = (window as unknown as { __BAMBOO_CONFIG__?: RuntimeConfig }).__BAMBOO_CONFIG__ ?? {};

const pick = (...values: (string | undefined)[]) => values.find((v) => v && v.trim()) as string;

export const config = {
  keycloakUrl: pick(runtime.keycloakUrl, import.meta.env.VITE_KEYCLOAK_URL, window.location.origin),
  keycloakRealm: pick(runtime.keycloakRealm, import.meta.env.VITE_KEYCLOAK_REALM, "bms"),
  keycloakClient: pick(runtime.keycloakClient, import.meta.env.VITE_KEYCLOAK_CLIENT, "bms-web"),
  hasuraUrl: pick(runtime.hasuraUrl, import.meta.env.VITE_HASURA_URL, `${window.location.origin}/graphql`),
  setupUrl: pick(runtime.setupUrl, import.meta.env.VITE_SETUP_URL, `${window.location.origin}/setup`),
  extUrl: pick(runtime.extUrl, import.meta.env.VITE_EXT_URL, `${window.location.origin}/ext`),
};
