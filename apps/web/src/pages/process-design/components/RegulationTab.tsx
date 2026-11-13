/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import { Checkbox, Tag } from "antd";
import { useState } from "react";
import { Link } from "react-router";

import { primaryButtonClass } from "../../../components/ui";
import { PROPOSAL_STATUS } from "../../knowledge-library/labels";
import type { Regulation } from "../types";
import { tr, trf } from "../../../i18n";

export const RegulationTab = ({
  regulations,
  latestVersion,
  canDraft,
  onDraft,
}: {
  regulations: Regulation[];
  latestVersion: number | null;
  canDraft: boolean;
  onDraft: (submit: boolean) => Promise<void>;
}) => {
  const [submit, setSubmit] = useState(true);
  const [busy, setBusy] = useState(false);
  const mine = regulations.filter((r) => r.kind === "REGULATION");
  const sources = regulations.filter((r) => r.kind === "SOURCE");
  const live = mine.find((r) => r.status === "APPROVED");
  const closed = ["CANCELLED", "REJECTED", "RETIRED"];
  const open = latestVersion !== null && mine.some((r) => r.version === latestVersion && !closed.includes(r.status));

  const draft = async () => {
    setBusy(true);
    try {
      await onDraft(submit);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card"
      aria-label={tr("Quy định")}
    >
      <div>
        <h2 className="m-0 text-[14px] font-semibold text-ink">{tr("Văn bản quy định của quy trình")}</h2>
        <p className="m-0 mt-1 text-[12.5px] text-body">
          {tr(
            "Từ phiên bản đã phát hành, hệ thống lập văn bản quy định (các bước, người thực hiện, thời hạn, chuyển tiếp, kèm hình sơ đồ) và đề xuất vào thư viện tri thức. Văn bản đi theo chuỗi duyệt tài liệu; duyệt xong là quy định đang hiệu lực của công ty, thay thế quy định của phiên bản trước.",
          )}
        </p>
      </div>

      <div className="rounded-xl border border-line/80 p-3 text-[13px]">
        {live ? (
          <>
            <Tag color="green">{tr("Đang hiệu lực")}</Tag>
            <Link to={`/h/library?doc=${live.id}`} className="font-mono text-[12.5px]">
              {live.docNo}
            </Link>{" "}
            {tr("· quy trình v")}
            {live.version} · {live.publishedAt}
          </>
        ) : (
          <span className="text-muted">{tr("Chưa có quy định nào đang hiệu lực cho quy trình này.")}</span>
        )}
      </div>

      {canDraft && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={busy || latestVersion === null || open}
            onClick={() => void draft()}
          >
            {busy ? tr("Đang lập…") : trf("Lập văn bản quy định{0}", [latestVersion ? ` cho v${latestVersion}` : ""])}
          </button>
          <Checkbox checked={submit} onChange={(e) => setSubmit(e.target.checked)}>
            {tr("Gửi duyệt ngay")}
          </Checkbox>
          {latestVersion === null && (
            <span className="text-[12.5px] text-muted">{tr("Phát hành quy trình trước.")}</span>
          )}
          {open && <span className="text-[12.5px] text-muted">{tr("Phiên bản này đã có văn bản quy định.")}</span>}
        </div>
      )}

      {mine.length > 0 && (
        <ul className="m-0 list-none space-y-2 p-0">
          {mine.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Tag color={PROPOSAL_STATUS[r.status]?.color ?? "default"}>
                {PROPOSAL_STATUS[r.status]?.label ?? r.status}
              </Tag>
              <Link
                to={r.status === "APPROVED" ? `/h/library?doc=${r.id}` : `/h/library/proposals/${r.id}`}
                className="font-mono"
              >
                {r.docNo}
              </Link>
              <span className="text-muted">
                {tr("quy trình v")}
                {r.version}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sources.length > 0 && (
        <p className="m-0 text-[12.5px] text-muted">
          {tr("Dựng từ văn bản:")}{" "}
          {sources.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link to={`/h/library?doc=${r.id}`} className="font-mono">
                {r.docNo}
              </Link>{" "}
              {r.title}
            </span>
          ))}
        </p>
      )}
    </section>
  );
};
