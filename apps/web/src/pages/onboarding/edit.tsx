/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState } from "react";
import { Edit } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
import { Alert, Spin } from "antd";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { OnboardingForm } from "./form";
import { OB_DETAIL } from "./queries";
import type { Onboarding } from "./types";
import { tr, trf } from "../../i18n";

export const OnboardingEdit = () => {
  const { id } = useParsed();
  const go = useGo();
  const { tenant } = useSession();
  const [record, setRecord] = useState<Onboarding | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    request<{ hr_onboarding_request_by_pk: Onboarding | null }>(OB_DETAIL, { id })
      .then((r) => setRecord(r.hr_onboarding_request_by_pk))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Alert type="error" message={error} />;
  if (record === undefined) return <Spin />;
  if (record === null) return <Alert type="warning" message={tr("Không tìm thấy hồ sơ")} />;
  if (record.requester_id !== tenant.person_id || !["DRAFT", "RETURNED"].includes(record.status)) {
    return <Alert type="info" showIcon message={tr("Chỉ người lập sửa được hồ sơ đang nháp hoặc bị trả về.")} />;
  }
  return (
    <Edit title={trf("Sửa {0}", [record.doc_no])} footerButtons={() => null} headerButtons={() => null}>
      <OnboardingForm
        record={record}
        onSaved={(savedId) => go({ to: { resource: "hr_onboarding_request", action: "show", id: savedId } })}
      />
    </Edit>
  );
};
