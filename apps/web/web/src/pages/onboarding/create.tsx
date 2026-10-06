// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Create } from "@refinedev/antd";
import { useGo } from "@refinedev/core";
import { OnboardingForm } from "./form";

export const OnboardingCreate = () => {
  const go = useGo();
  return (
    <Create title="Lập hồ sơ tiếp nhận nhân sự" footerButtons={() => null}>
      <OnboardingForm onSaved={(id) => go({ to: { resource: "hr_onboarding_request", action: "show", id } })} />
    </Create>
  );
};
