// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { TriangleAlert } from "lucide-react";

import type { LineageNode, QualityCheck } from "../types";
import { tr, trf } from "../../../i18n";

export const QualityAlertBanner = ({
  failures,
  onView,
}: {
  failures: Array<{ node: LineageNode; check: QualityCheck; impacted: number }>;
  onView: (nodeId: string) => void;
}) => {
  const first = failures[0];
  if (!first) return null;
  const more = failures.length - 1;
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex min-w-0 items-start gap-2.5 text-[13px] text-body">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
        <span>
          <b className="font-semibold text-ink">
            {tr("Kiểm tra “")}
            {first.check.name}
            {tr("” thất bại")}
            {first.check.failedAt ? trf(" lúc {0}", [first.check.failedAt]) : ""}
          </b>{" "}
          {tr("trên ")} <span className="font-mono text-[12.5px]">{first.node.fqn}</span>
          {first.impacted > 0 && trf(" · {0} tài sản phía sau bị ảnh hưởng", [first.impacted])}
          {more > 0 && trf(" · và {0} lỗi khác", [more])}
        </span>
      </p>
      <button
        type="button"
        onClick={() => onView(first.node.id)}
        className="inline-flex h-8 shrink-0 items-center self-start rounded-ui border border-red-200 bg-surface px-3.5 text-[12.5px] font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 sm:self-auto"
      >
        {tr("Xem kiểm tra")}
      </button>
    </div>
  );
};
