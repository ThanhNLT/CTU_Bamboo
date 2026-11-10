import type { AuthProvider } from "@refinedev/core";

import { setTenant, setToken } from "../api/client";
import { keycloak } from "../auth/keycloak";
import { getLocale } from "../i18n";

export const LOGIN_ATTEMPT_KEY = "bamboo.login-attempt";

const clearLoginAttempt = () => {
  try {
    sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
  } catch {}
};

export const authProvider: AuthProvider = {
  login: async () => {
    const to = new URLSearchParams(window.location.search).get("to");
    const path = to && /^\/(?![/\\])/.test(to) ? to : "";
    await keycloak.login({ redirectUri: `${window.location.origin}${path}`, locale: getLocale() });
    return { success: true };
  },
  logout: async () => {
    clearLoginAttempt();
    setTenant(null);
    setToken(undefined);
    await keycloak.logout({ redirectUri: window.location.origin });
    return { success: true, redirectTo: "/login" };
  },
  check: async () => {
    if (!keycloak.authenticated) {
      return { authenticated: false, redirectTo: "/login" };
    }
    try {
      await keycloak.updateToken(30);
      setToken(keycloak.token);
      clearLoginAttempt();
      return { authenticated: true };
    } catch {
      return { authenticated: false, logout: true, redirectTo: "/login" };
    }
  },
  onError: async (error) => {
    if (error?.statusCode === 401) return { logout: true, redirectTo: "/login", error };
    return { error };
  },
  getIdentity: async () => {
    const t = keycloak.tokenParsed as { name?: string; preferred_username?: string } | undefined;
    return t ? { name: t.name ?? t.preferred_username } : null;
  },
};
