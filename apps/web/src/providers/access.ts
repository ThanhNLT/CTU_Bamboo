/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import type { AccessControlProvider } from "@refinedev/core";

import { getTenant, request } from "../api/client";
import { trf } from "../i18n";

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
  admin_area: { list: ["core.org.manage", "core.permission.manage", "core.module.manage", "mdm.manage", "audit.read"] },
  admin_modules: { list: "core.module.manage" },
  ai_agents: { list: "core.ai.manage" },
  admin_company: { list: ["core.org.manage", "core.permission.manage", "core.module.manage"] },
  admin_org: { list: "core.org.manage" },
  admin_people: { list: "core.org.manage" },
  admin_roles: { list: "core.permission.manage" },
  admin_queue: { list: "core.org.manage" },
  admin_ops: { list: "audit.read" },
  admin_catalog: { list: ["core.org.manage", "mdm.manage"] },
  proc_purchase_request: { create: "proc.purchase_request.create" },
  hr_transfer_request: { list: ["hr.transfer.read", "hr.transfer.create"] },
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
      : { can: false, reason: trf("Cần quyền {0}", [anyOf.join(" hoặc ")]) };
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
};
