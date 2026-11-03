// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request } from "../api/client";
import { keycloak } from "../auth/keycloak";

export type ModuleService = { name: string; running: boolean | null };

export type ModuleInfo = {
  code: string;
  name: string;
  description: string;
  depends: string[];
  dependents: string[];
  services: ModuleService[];
  installed: boolean;
  enabled: boolean;
};

export type ModuleOverview = {
  can_manage: boolean;
  can_install: boolean;
  modules: ModuleInfo[];
  changed: string[];
};

const FIELDS = `can_manage can_install changed
  modules { code name description depends dependents installed enabled services { name running } }`;

/** Tài khoản có vai trò platform_admin thì gọi với role đó để cài/gỡ mô-đun trên máy (ADR #56). */
export const isPlatformAdmin = (): boolean =>
  ((keycloak.tokenParsed as { realm_access?: { roles?: string[] } } | undefined)?.realm_access?.roles ?? []).includes(
    "platform_admin",
  );

const role = () => (isPlatformAdmin() ? ("platform_admin" as const) : undefined);

export const fetchModules = () =>
  request<{ modules: ModuleOverview }>(`query Modules { modules { ${FIELDS} } }`, undefined, { role: role() }).then(
    (r) => r.modules,
  );

export type ModuleChange = "module_enable" | "module_disable" | "module_install" | "module_uninstall";

export const changeModule = (action: ModuleChange, code: string) =>
  request<Record<ModuleChange, ModuleOverview>>(
    `mutation ChangeModule($code: String!) { ${action}(code: $code) { ${FIELDS} } }`,
    { code },
    { role: role() },
  ).then((r) => r[action]);
