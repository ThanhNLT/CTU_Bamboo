/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { createRoot } from "react-dom/client";
import { ReactKeycloakProvider } from "@react-keycloak/web";

import App from "./App";
import { setToken } from "./api/client";
import { keycloak } from "./auth/keycloak";
import { registerServiceWorker } from "./pwa";

registerServiceWorker();

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
