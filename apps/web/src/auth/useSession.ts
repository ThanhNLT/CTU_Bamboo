// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from "react";

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

export const SessionContext = createContext<Session | null>(null);

export const useSession = (): Session => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession phải nằm trong <TenantGate>");
  return session;
};
