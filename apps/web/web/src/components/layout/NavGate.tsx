// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { CanAccess } from "@refinedev/core";
import type { ReactNode } from "react";

/** Chỉ hiện con khi accessControlProvider cho phép (ẩn menu theo quyền như ThemedSider cũ). */
export const NavGate = ({ access, children }: { access?: { resource: string; action: string }; children: ReactNode }) =>
  access ? (
    <CanAccess resource={access.resource} action={access.action} fallback={null}>
      {children}
    </CanAccess>
  ) : (
    <>{children}</>
  );
