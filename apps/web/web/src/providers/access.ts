// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Ẩn menu/nút theo quyền thật của người dùng trong tenant (core_v_permission_grant chỉ trả quyền
// của chính người gọi). Đây chỉ là lớp giao diện: quyền thật kiểm tra ở Hasura và CSDL (ADR #6).

// ===== Thư viện =====
import type { AccessControlProvider } from "@refinedev/core"; // Refine

// ===== Module nội bộ =====
import { getTenant, request } from "../api/client";

// ===== Trạng thái module =====
// Bộ nhớ đệm quyền theo TỪNG tenant. Chưa chọn tenant (ngay sau đăng nhập, TenantGate còn đang tải) thì
// không gọi máy chủ và KHÔNG lưu đệm: nếu lưu một tập rỗng lúc đó, menu có phân quyền (Kiểm toán, Tiếp nhận
// nhân sự) sẽ bị ẩn mãi tới khi tải lại trang — chính là lỗi kiểm thử e2e chập chờn trước đây.
let cache: { tenant: string; promise: Promise<Set<string>> } | null = null;

// ===== Hàm tiện ích =====
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
        // Lỗi mạng / máy chủ: bỏ đệm để lần hỏi sau gọi lại.
        if (cache === entry) cache = null;
        return new Set<string>();
      });
    cache = entry;
  }
  return cache.promise;
};

// ===== Hằng số =====
// Một quyền, hoặc danh sách = có MỘT trong các quyền là đủ.
const RULES: Record<string, Partial<Record<string, string | string[]>>> = {
  audit_log: { list: "audit.read" },
  // Quản trị dữ liệu tenant (ADR #44).
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
