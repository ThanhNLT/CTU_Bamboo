// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import type { AuthProvider } from "@refinedev/core"; // Refine

// ===== Module nội bộ =====
import { setTenant, setToken } from "../api/client";
import { keycloak } from "../auth/keycloak";

// ===== Hằng số =====
export const authProvider: AuthProvider = {
  login: async () => {
    // Chỉ nhận đường dẫn nội bộ ("/p/tasks"): "@evil.com" hay "//evil.com" ghép sau origin sẽ thành địa chỉ ngoài.
    const to = new URLSearchParams(window.location.search).get("to");
    const path = to && /^\/(?![/\\])/.test(to) ? to : "";
    await keycloak.login({ redirectUri: `${window.location.origin}${path}` });
    return { success: true };
  },
  logout: async () => {
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
