import Keycloak from "keycloak-js";

import { config } from "../config";

export const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClient,
});
