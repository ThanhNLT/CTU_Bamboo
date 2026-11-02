// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Edit } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
import { Alert, Spin } from "antd";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { OnboardingForm } from "./form";
import { OB_DETAIL } from "./queries";
import type { Onboarding } from "./types";

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
  if (record === null) return <Alert type="warning" message="Không tìm thấy hồ sơ" />;
  if (record.requester_id !== tenant.person_id || !["DRAFT", "RETURNED"].includes(record.status)) {
    return <Alert type="info" showIcon message="Chỉ người lập sửa được hồ sơ đang nháp hoặc bị trả về." />;
  }
  return (
    <Edit title={`Sửa ${record.doc_no}`} footerButtons={() => null} headerButtons={() => null}>
      <OnboardingForm
        record={record}
        onSaved={(savedId) => go({ to: { resource: "hr_onboarding_request", action: "show", id: savedId } })}
      />
    </Edit>
  );
};
