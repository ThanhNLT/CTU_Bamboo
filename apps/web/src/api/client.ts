// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { GraphQLClient, graphqlWS } from "@refinedev/hasura";
import type { HttpError } from "@refinedev/core";

import { config } from "../config";
import { tr, trf } from "../i18n";

export const API_URL = config.hasuraUrl;
const WS_URL = API_URL.replace(/^http/, "ws");
const TENANT_KEY = "bamboo.tenant";

let token: string | undefined;

const DEVICE_KEY = "bamboo.device";

/** Mã ngẫu nhiên của trình duyệt này, để máy chủ nhận ra quản trị viên đăng nhập từ thiết bị mới (ADR #57). */
const deviceId = (() => {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
})();

const agent = (() => {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : tr("Trình duyệt khác");
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? trf("{0} trên {1}", [browser, os]) : browser;
})();

export const getTenant = (): string | null => {
  try {
    return localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
};

const headers = (withTenant = true): Record<string, string> => {
  const h: Record<string, string> = { "x-bamboo-agent": agent };
  if (deviceId) h["x-bamboo-device"] = deviceId;
  if (token) h.Authorization = `Bearer ${token}`;
  const tenant = withTenant ? getTenant() : null;
  // Header rỗng ghi đè header tenant của client mặc định (graphql-request gộp header client trước, header yêu cầu sau);
  // máy chủ coi rỗng là chưa chọn tenant.
  if (tenant) h["x-bamboo-tenant"] = tenant;
  else if (!withTenant) h["x-bamboo-tenant"] = "";
  return h;
};

export const client = new GraphQLClient(API_URL, { headers: () => headers() });

export const wsClient = graphqlWS.createClient({
  url: WS_URL,
  lazy: true,
  connectionParams: () => ({ headers: headers() }),
});

export const setToken = (value: string | undefined) => {
  token = value;
};

export const setTenant = (tenantId: string | null) => {
  try {
    if (tenantId) localStorage.setItem(TENANT_KEY, tenantId);
    else localStorage.removeItem(TENANT_KEY);
  } catch {}
  wsClient.terminate();
};

type GqlErrorShape = { response?: { errors?: { message: string; extensions?: { code?: string } }[] } };

export const toHttpError = (error: unknown): HttpError => {
  const first = (error as GqlErrorShape)?.response?.errors?.[0];
  const code = first?.extensions?.code;
  const statusCode = code === "not-found" ? 404 : code === "forbidden" ? 403 : code === "unauthorized" ? 401 : 400;
  return {
    message: first?.message ?? (error instanceof Error ? error.message : tr("Lỗi không xác định")),
    statusCode,
    errors: code ? { code } : undefined,
  } as HttpError;
};

export async function request<T = Record<string, unknown>>(
  document: string,
  variables?: Record<string, unknown>,
  options: { withTenant?: boolean; role?: "platform_admin" } = {},
): Promise<T> {
  const requestHeaders = headers(options.withTenant ?? true);
  if (options.role) requestHeaders["x-hasura-role"] = options.role;
  try {
    return await client.request<T>({ document, variables, requestHeaders });
  } catch (error) {
    throw toHttpError(error);
  }
}
