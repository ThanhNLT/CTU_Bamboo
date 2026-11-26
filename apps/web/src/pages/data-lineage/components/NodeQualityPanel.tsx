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

import { Bell, Check, X } from "lucide-react";
import { Link } from "react-router";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { STATUS_LABEL, failedChecks } from "../graph";
import type { LineageNode, NodeStatus } from "../types";
import { tr, trf } from "../../../i18n";

const TAG_CLASS: Record<NodeStatus, string> = {
  healthy: "bg-bamboo-50 text-bamboo-800",
  failed: "bg-red-50 text-red-700",
  affected: "bg-yellow-50 text-amber-800",
};
const DOT_CLASS: Record<NodeStatus, string> = {
  healthy: "bg-bamboo-500",
  failed: "bg-red-500",
  affected: "bg-yellow-500",
};

const SectionTitle = ({ children, id }: { children: string; id?: string }) => (
  <h3 id={id} className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
    {children}
  </h3>
);

const fullWidth = "w-full justify-center";

export const NodeQualityPanel = ({
  node,
  status,
  causes,
  impacts,
  statuses,
  notified,
  onNotify,
  onSelect,
  className,
}: {
  node: LineageNode;
  status: NodeStatus;
  causes: LineageNode[];
  impacts: LineageNode[];
  statuses: Map<string, NodeStatus>;
  notified: boolean;
  onNotify: () => void;
  onSelect: (id: string) => void;
  className?: string;
}) => {
  const failed = failedChecks(node).length;
  const tag = status === "failed" ? trf("{0} kiểm tra lỗi", [failed]) : STATUS_LABEL[status];

  return (
    <aside
      aria-label={trf("Chi tiết {0}", [node.fqn])}
      className={cn("flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card", className)}
    >
      <div className="break-all font-mono text-[11.5px] text-muted">{node.fqn}</div>
      <h2 className="mt-1 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">{node.title}</h2>
      <span
        className={cn(
          "mt-2 inline-flex h-6 items-center gap-1.5 self-start rounded-full px-2.5 text-[12px] font-medium",
          TAG_CLASS[status],
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-ui", DOT_CLASS[status])} aria-hidden />
        {tag}
      </span>

      <dl className="m-0 mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line pb-4">
        <div className="min-w-0">
          <dt className="text-[11.5px] text-muted">{tr("Chủ sở hữu")}</dt>
          <dd className="m-0 mt-0.5 truncate text-[13px] text-ink">{node.owner}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11.5px] text-muted">{tr("Cập nhật")}</dt>
          <dd className="m-0 mt-0.5 text-[13px] tabular-nums text-ink">{node.updated}</dd>
        </div>
      </dl>

      {causes.length > 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-yellow-500 bg-yellow-50 px-3 py-2 text-[12px] text-amber-900">
          {tr("Bị ảnh hưởng bởi lỗi ở")}{" "}
          {causes.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="font-mono font-semibold underline-offset-2 hover:underline"
              >
                {c.fqn}
              </button>
            </span>
          ))}
        </p>
      )}

      <section className="border-b border-line py-4" aria-labelledby="lineage-checks">
        <SectionTitle id="lineage-checks">{tr("Kiểm tra chất lượng · Soda")}</SectionTitle>
        {node.checks.length === 0 ? (
          <p className="mt-2.5 text-[12.5px] text-muted">{tr("Chưa có kiểm tra Soda cho tài sản này.")}</p>
        ) : (
          <ul className="m-0 mt-2.5 list-none flex flex-col gap-3 p-0">
            {node.checks.map((c) => (
              <li key={c.rule} className="flex items-start gap-2.5">
                {c.passed ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-bamboo-600" aria-label={tr("Đạt")} />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label={tr("Lỗi")} />
                )}
                <span className="min-w-0">
                  <span className="block break-all font-mono text-[12px] text-ink">{c.rule}</span>
                  <span className={cn("block text-[11.5px]", c.passed ? "text-muted" : "font-medium text-red-700")}>
                    {c.detail}
                    {c.failedAt && trf(" · lúc {0}", [c.failedAt])}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="py-4" aria-labelledby="lineage-impact">
        <SectionTitle id="lineage-impact">{tr("Tác động phía sau")}</SectionTitle>
        {impacts.length === 0 ? (
          <p className="mt-2.5 text-[12.5px] text-muted">{tr("Không có tài sản nào dùng dữ liệu này.")}</p>
        ) : (
          <ul className="m-0 mt-2.5 list-none flex flex-col gap-2.5 p-0">
            {impacts.map((n) => {
              const s = statuses.get(n.id) ?? "healthy";
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(n.id)}
                    className="group flex w-full items-start gap-2.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500"
                  >
                    <span className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-ui", DOT_CLASS[s])} aria-hidden />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[13px] font-semibold text-ink group-hover:text-bamboo-700",
                          n.mono && "font-mono",
                        )}
                      >
                        {n.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {n.usedBy ?? `${n.tech} · ${n.fqn}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <button type="button" onClick={onNotify} disabled={notified} className={cn(primaryButtonClass, fullWidth)}>
          {notified ? <Check className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
          {notified ? tr("Đã báo chủ sở hữu") : tr("Báo chủ sở hữu")}
        </button>
        {node.datasetId ? (
          <Link
            to={`/d/services?dataset=${encodeURIComponent(node.datasetId)}`}
            className={cn(secondaryButtonClass, fullWidth)}
          >
            {tr("Mở tập dữ liệu")}
          </Link>
        ) : node.appLink ? (
          <Link to={node.appLink} className={cn(secondaryButtonClass, fullWidth)}>
            {tr("Mở trong ứng dụng")}
          </Link>
        ) : null}
      </div>
    </aside>
  );
};
