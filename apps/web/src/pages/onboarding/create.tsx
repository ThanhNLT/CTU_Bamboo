/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Create } from "@refinedev/antd";
import { useGo } from "@refinedev/core";

import { OnboardingForm } from "./form";
import { tr } from "../../i18n";

export const OnboardingCreate = () => {
  const go = useGo();
  return (
    <Create title={tr("Lập hồ sơ tiếp nhận nhân sự")} footerButtons={() => null}>
      <OnboardingForm onSaved={(id) => go({ to: { resource: "hr_onboarding_request", action: "show", id } })} />
    </Create>
  );
};
