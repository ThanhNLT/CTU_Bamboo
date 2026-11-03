// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Button, Input, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { request } from "../../../api/client";
import { tr, trf } from "../../../i18n";

type Proposed = {
  request_id: string;
  doc_no: string;
  title: string;
  status: string;
  name: string;
  tax_code: string | null;
  requester: string;
  created_on: string;
};

const LIST = `query { proposed_partners { request_id doc_no title status name tax_code requester created_on } }`;
const ADOPT = `mutation Adopt($id: uuid!, $code: String) { adopt_proposed_partner(request_id: $id, code: $code) { id } }`;

export const ProposedPartners = ({ onAdopted }: { onAdopted: () => void }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Proposed[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();

  const load = useCallback(
    () =>
      request<{ proposed_partners: Proposed[] }>(LIST)
        .then((r) => setRows(r.proposed_partners))
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (rows.length === 0) return null;
  const adopt = async (r: Proposed) => {
    setBusy(r.request_id);
    try {
      await request(ADOPT, { id: r.request_id, code: codes[r.request_id]?.trim() || null });
      message.success(trf("Đã thêm “{0}” vào danh mục nhà cung cấp.", [r.name]));
      await load();
      onAdopted();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-card"
      aria-label={tr("Nhà cung cấp đề xuất")}
    >
      <h2 className="m-0 text-[14px] font-semibold text-ink">{tr("Nhà cung cấp đề xuất · chờ thêm vào danh mục")}</h2>
      <p className="m-0 mt-0.5 text-[12.5px] text-muted">
        {tr(
          "Người lập đề nghị gõ tên nhà cung cấp chưa có trong danh mục. Đặt mã rồi thêm; đã có nhà cung cấp cùng mã số thuế thì dùng lại nhà cung cấp đó.",
        )}
      </p>
      <ul className="m-0 mt-3 list-none divide-y divide-amber-200/70 p-0">
        {rows.map((r) => (
          <li key={r.request_id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="min-w-[240px] flex-1">
              <span className="block font-medium text-ink">
                {r.name} {r.tax_code && <Tag className="ml-1">MST {r.tax_code}</Tag>}
              </span>
              <span className="block text-[12px] text-muted">
                <Link to={`/p/documents/show/${r.request_id}`} className="font-mono">
                  {r.doc_no}
                </Link>{" "}
                · {r.title} · {r.requester} · {r.created_on}
              </span>
            </span>
            <Input
              className="w-[180px]"
              placeholder={tr("Mã nhà cung cấp mới")}
              aria-label={trf("Mã nhà cung cấp cho {0}", [r.name])}
              value={codes[r.request_id] ?? ""}
              onChange={(e) => setCodes((c) => ({ ...c, [r.request_id]: e.target.value }))}
            />
            <Button type="primary" loading={busy === r.request_id} onClick={() => void adopt(r)}>
              {tr("Thêm vào danh mục")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
};
