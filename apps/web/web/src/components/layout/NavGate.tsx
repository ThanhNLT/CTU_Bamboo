// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { CanAccess } from "@refinedev/core";
import type { ReactNode } from "react";
import { useSession } from "../../auth/useSession";

/**
 * Chỉ hiện con khi accessControlProvider cho phép (ẩn menu theo quyền như ThemedSider cũ).
 * Truyền tenant vào params để kết quả kiểm tra quyền được lưu đệm RIÊNG cho tenant đang chọn: không dùng lại
 * kết quả "không có quyền" của một lần hỏi sớm hơn, lúc tenant chưa được chọn.
 */
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
