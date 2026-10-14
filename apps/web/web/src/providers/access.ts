// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { AccessControlProvider } from "@refinedev/core";

import { getTenant, request } from "../api/client";

let cache: { tenant: string; promise: Promise<Set<string>> } | null = null;

export const myPermissions = (): Promise<Set<string>> => {
  const tenant = getTenant();
  if (!tenant) return Promise.resolve(new Set<string>());
  if (cache?.tenant !== tenant) {
    const entry: { tenant: string; promise: Promise<Set<string>> } = {
      tenant,
      promise: Promise.resolve(new Set<string>()),
    };
    entry.promise = request<{ core_v_permission_grant: { permission_code: string }[] }>(
      `query MyPermissions { core_v_permission_grant(distinct_on: permission_code) { permission_code } }`,
    )
      .then((r) => new Set(r.core_v_permission_grant.map((g) => g.permission_code)))
      .catch(() => {
        if (cache === entry) cache = null;
        return new Set<string>();
      });
    cache = entry;
  }
  return cache.promise;
};

const RULES: Record<string, Partial<Record<string, string | string[]>>> = {
  audit_log: { list: "audit.read" },
  admin_area: { list: ["core.org.manage", "core.permission.manage", "mdm.manage", "audit.read"] },
  admin_org: { list: "core.org.manage" },
  admin_people: { list: "core.org.manage" },
  admin_roles: { list: "core.permission.manage" },
  admin_catalog: { list: ["core.org.manage", "mdm.manage"] },
  proc_purchase_request: { create: "proc.purchase_request.create" },
  hr_onboarding_request: { list: "hr.onboarding.read", create: "hr.onboarding.create" },
};

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const needed = resource ? RULES[resource]?.[action] : undefined;
    if (!needed) return { can: true };
    const perms = await myPermissions();
    const anyOf = Array.isArray(needed) ? needed : [needed];
    return anyOf.some((p) => perms.has(p))
      ? { can: true }
      : { can: false, reason: `Cần quyền ${anyOf.join(" hoặc ")}` };
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
};
