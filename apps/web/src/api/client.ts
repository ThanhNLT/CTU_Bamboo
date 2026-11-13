/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { GraphQLClient, graphqlWS } from "@refinedev/hasura";
import type { HttpError } from "@refinedev/core";

import { config } from "../config";
import { tr, trf } from "../i18n";
import { localizeServer, trServer } from "../i18n/server";

export const API_URL = config.hasuraUrl;
const WS_URL = API_URL.replace(/^http/, "ws");
const TENANT_KEY = "bamboo.tenant";

let token: string | undefined;

const DEVICE_KEY = "bamboo.device";

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

const sessionDevice = crypto.randomUUID();
export const getDeviceId = () => deviceId || sessionDevice;

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
  if (tenant) h["x-bamboo-tenant"] = tenant;
  else if (!withTenant) h["x-bamboo-tenant"] = "";
  return h;
};

export const client = new GraphQLClient(API_URL, {
  headers: () => headers(),
  responseMiddleware: (response) => {
    if (!(response instanceof Error)) localizeServer(response.data);
  },
});

export const wsClient = graphqlWS.createClient({
  url: WS_URL,
  lazy: true,
  connectionParams: () => ({ headers: headers() }),
  on: {
    message: (message) => {
      if (message.type === "next") localizeServer(message.payload.data);
    },
  },
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

type GqlErrorShape = {
  response?: { status?: number; error?: string; errors?: { message: string; extensions?: { code?: string } }[] };
};

export const toHttpError = (error: unknown): HttpError => {
  const response = (error as GqlErrorShape)?.response;
  const first = response?.errors?.[0];
  const code = first?.extensions?.code;
  const gateway = !first && response?.status && response.status >= 400 ? response.status : undefined;
  const statusCode =
    code === "not-found" ? 404 : code === "forbidden" ? 403 : code === "unauthorized" ? 401 : (gateway ?? 400);
  return {
    message:
      (first?.message ? trServer(first.message) : undefined) ??
      (gateway
        ? trf(
            gateway >= 500
              ? "Hệ thống đang khởi động hoặc tạm gián đoạn (mã {0}), thử lại sau ít giây"
              : "Cổng API từ chối yêu cầu (mã {0})",
            [gateway],
          )
        : error instanceof Error
          ? error.message
          : tr("Lỗi không xác định")),
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
