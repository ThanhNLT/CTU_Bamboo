// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Create } from "@refinedev/antd"; // Refine Ant Design
import { useGo } from "@refinedev/core"; // Refine

// ===== Module nội bộ =====
import { OnboardingForm } from "./form";

// ===== Component =====
export const OnboardingCreate = () => {
  const go = useGo();
  return (
    <Create title="Lập hồ sơ tiếp nhận nhân sự" footerButtons={() => null}>
      <OnboardingForm onSaved={(id) => go({ to: { resource: "hr_onboarding_request", action: "show", id } })} />
    </Create>
  );
};
