// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Create } from "@refinedev/antd"; // Refine Ant Design
import { useGo } from "@refinedev/core"; // Refine

// ===== Module nội bộ =====
import { PurchaseRequestForm } from "./form";

// ===== Component =====
export const PurchaseRequestCreate = () => {
  const go = useGo();
  return (
    <Create title="Lập đề nghị mua sắm" footerButtons={() => null}>
      <PurchaseRequestForm onSaved={(id) => go({ to: { resource: "proc_purchase_request", action: "show", id } })} />
    </Create>
  );
};
