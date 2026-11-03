// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request } from "../api/client";
import { keycloak } from "../auth/keycloak";
import { tr } from "../i18n";

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
  external: boolean;
  vendor: string | null;
  version: string | null;
  scopes: string[];
  menu: { label: string; path: string }[];
};

export type ModuleOverview = {
  can_manage: boolean;
  can_install: boolean;
  modules: ModuleInfo[];
  changed: string[];
};

const FIELDS = `can_manage can_install changed
  modules { code name description depends dependents installed enabled services { name running }
    external vendor version scopes menu { label path } }`;

/** Tài khoản có vai trò platform_admin thì gọi với role đó để cài/gỡ mô-đun trên máy (ADR #56). */
export const isPlatformAdmin = (): boolean =>
  ((keycloak.tokenParsed as { realm_access?: { roles?: string[] } } | undefined)?.realm_access?.roles ?? []).includes(
    "platform_admin",
  );

const role = () => (isPlatformAdmin() ? ("platform_admin" as const) : undefined);

// Tên và mô tả mô-đun dựng sẵn do máy chủ trả bằng tiếng Việt (danh mục cố định trong modules.py): dịch theo ngôn ngữ đang
// chọn; mô-đun ngoài giữ nguyên tên nhà phát triển khai trong manifest
export const localizeModule = <T extends { name: string; description: string; external?: boolean }>(m: T): T =>
  m.external ? m : { ...m, name: tr(m.name), description: tr(m.description) };

const localize = (o: ModuleOverview): ModuleOverview => ({ ...o, modules: o.modules.map(localizeModule) });

export const fetchModules = () =>
  request<{ modules: ModuleOverview }>(`query Modules { modules { ${FIELDS} } }`, undefined, { role: role() }).then(
    (r) => localize(r.modules),
  );

export type ModuleChange = "module_enable" | "module_disable" | "module_install" | "module_uninstall";

export const changeModule = (action: ModuleChange, code: string) =>
  request<Record<ModuleChange, ModuleOverview>>(
    `mutation ChangeModule($code: String!) { ${action}(code: $code) { ${FIELDS} } }`,
    { code },
    { role: role() },
  ).then((r) => localize(r[action]));

export const SCOPE_LABEL: Record<string, string> = {
  "org.read": tr("Đọc cơ cấu tổ chức (đơn vị, vị trí)"),
  "people.read": tr("Đọc danh sách nhân sự (họ tên, mã nhân viên, vị trí)"),
  "notify.send": tr("Gửi thông báo cho người trong công ty"),
};

export type ExtRegistered = {
  code: string;
  api_key: string | null;
  reachable: boolean;
  message: string;
  updated: boolean;
};

export const registerExternal = (manifest: unknown) =>
  request<{ ext_register: ExtRegistered }>(
    `mutation Register($m: jsonb!) { ext_register(manifest: $m) { code api_key reachable message updated } }`,
    { m: manifest },
    { role: role() },
  ).then((r) => r.ext_register);

export const rotateExternalKey = (code: string) =>
  request<{ ext_rotate_key: ExtRegistered }>(
    `mutation Rotate($c: String!) { ext_rotate_key(code: $c) { code api_key reachable message updated } }`,
    { c: code },
    { role: role() },
  ).then((r) => r.ext_rotate_key);

export const launchExternal = (code: string, path?: string) =>
  request<{ ext_launch: { path: string; name: string } }>(
    `mutation Launch($c: String!, $p: String) { ext_launch(code: $c, path: $p) { path name } }`,
    { c: code, p: path ?? null },
  ).then((r) => r.ext_launch);
