// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { GraphQLClient, graphqlWS } from "@refinedev/hasura";
import type { HttpError } from "@refinedev/core";

import { config } from "../config";

export const API_URL = config.hasuraUrl;
const WS_URL = API_URL.replace(/^http/, "ws");
const TENANT_KEY = "bamboo.tenant";

let token: string | undefined;

export const getTenant = (): string | null => {
  try {
    return localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
};

const headers = (withTenant = true): Record<string, string> => {
  const h: Record<string, string> = {};
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
    message: first?.message ?? (error instanceof Error ? error.message : "Lỗi không xác định"),
    statusCode,
    errors: code ? { code } : undefined,
  } as HttpError;
};

export async function request<T = Record<string, unknown>>(
  document: string,
  variables?: Record<string, unknown>,
  options: { withTenant?: boolean } = {},
): Promise<T> {
  try {
    return await client.request<T>({
      document,
      variables,
      requestHeaders: headers(options.withTenant ?? true),
    });
  } catch (error) {
    throw toHttpError(error);
  }
}
