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
