/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { createContext, useContext } from "react";
import { tr } from "../i18n";

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
  if (!session) throw new Error(tr("useSession phải nằm trong <TenantGate>"));
  return session;
};
