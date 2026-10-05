// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Ẩn menu/nút theo quyền thật của người dùng trong tenant (core_v_permission_grant chỉ trả quyền
// của chính người gọi). Đây chỉ là lớp giao diện: quyền thật kiểm tra ở Hasura và CSDL (ADR #6).
import type { AccessControlProvider } from "@refinedev/core";
import { request } from "../api/client";

let cached: Promise<Set<string>> | null = null;

export const myPermissions = (): Promise<Set<string>> => {
  cached ??= request<{ core_v_permission_grant: { permission_code: string }[] }>(
    `query MyPermissions { core_v_permission_grant(distinct_on: permission_code) { permission_code } }`,
  )
    .then((r) => new Set(r.core_v_permission_grant.map((g) => g.permission_code)))
    .catch(() => {
      cached = null;
      return new Set<string>();
    });
  return cached;
};

const RULES: Record<string, Partial<Record<string, string>>> = {
  audit_log: { list: "audit.read" },
  proc_purchase_request: { create: "proc.purchase_request.create" },
  hr_onboarding_request: { list: "hr.onboarding.read", create: "hr.onboarding.create" },
};

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const needed = resource ? RULES[resource]?.[action] : undefined;
    if (!needed) return { can: true };
    const perms = await myPermissions();
    return perms.has(needed) ? { can: true } : { can: false, reason: `Cần quyền ${needed}` };
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
};
