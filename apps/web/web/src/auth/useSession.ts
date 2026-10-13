// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Ngữ cảnh phiên làm việc (tenant đang chọn) — tách khỏi session.tsx để file component chỉ xuất component
// (Fast Refresh, luật react-refresh/only-export-components). <TenantGate> cung cấp giá trị.

// ===== Thư viện =====
import { createContext, useContext } from "react"; // React

// ===== Kiểu dữ liệu =====
export type AccountTenant = {
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  person_id: string;
  full_name: string;
};

export type Session = {
  tenant: AccountTenant;
  tenants: AccountTenant[];
  switchTenant: (tenantId: string) => void;
};

// ===== Ngữ cảnh (Context) =====
export const SessionContext = createContext<Session | null>(null);

// ===== Hook =====
export const useSession = (): Session => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession phải nằm trong <TenantGate>");
  return session;
};
