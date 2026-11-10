/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { CanAccess } from "@refinedev/core";
import type { ReactNode } from "react";

import { useSession } from "../../auth/useSession";

export const NavGate = ({
  access,
  children,
}: {
  access?: { resource: string; action: string };
  children: ReactNode;
}) => {
  const { tenant } = useSession();
  return access ? (
    <CanAccess
      resource={access.resource}
      action={access.action}
      params={{ tenantId: tenant.tenant_id }}
      fallback={null}
    >
      {children}
    </CanAccess>
  ) : (
    <>{children}</>
  );
};
