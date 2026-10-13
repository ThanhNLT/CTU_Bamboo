// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Edit } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
import { Alert, Spin } from "antd";
import dayjs from "dayjs";
import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { PurchaseRequestForm, type PrFormValues } from "./form";
import { PR_DETAIL } from "./queries";
import type { PurchaseRequest } from "./types";

export const PurchaseRequestEdit = () => {
  const { id } = useParsed();
  const go = useGo();
  const { tenant } = useSession();
  const [pr, setPr] = useState<PurchaseRequest | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    request<{ proc_purchase_request_by_pk: PurchaseRequest | null }>(PR_DETAIL, { id })
      .then((r) => setPr(r.proc_purchase_request_by_pk))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Alert type="error" message={error} />;
  if (pr === undefined) return <Spin />;
  if (pr === null) return <Alert type="warning" message="Không tìm thấy đề nghị" />;
  if (pr.requester_id !== tenant.person_id || !["DRAFT", "RETURNED"].includes(pr.status)) {
    return <Alert type="info" showIcon message="Chỉ người lập sửa được đề nghị đang nháp hoặc bị trả về." />;
  }

  const initial: Partial<PrFormValues> = {
    title: pr.title,
    description: pr.description ?? undefined,
    requester_position_id: pr.requester_position_id,
    category_code: pr.category_code,
    partner_id: pr.partner_id,
    needed_by: pr.needed_by ? dayjs(pr.needed_by) : null,
    items: pr.purchase_request_items.map((i) => ({
      item_id: i.item_id,
      description: i.description,
      uom: i.uom,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      note: i.note ?? undefined,
    })),
  };
  return (
    <Edit title={`Sửa ${pr.doc_no}`} footerButtons={() => null} headerButtons={() => null}>
      {pr.status === "RETURNED" && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="Đề nghị bị trả về: sửa theo ý kiến người duyệt rồi gửi duyệt lại (chuỗi duyệt tính lại theo hạn mức hiện hành)."
        />
      )}
      <PurchaseRequestForm
        id={pr.id}
        initial={initial}
        onSaved={(savedId) => go({ to: { resource: "proc_purchase_request", action: "show", id: savedId } })}
      />
    </Edit>
  );
};
