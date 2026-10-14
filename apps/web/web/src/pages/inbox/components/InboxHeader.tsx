// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Segmented } from "antd";

import type { InboxScope } from "../types";

export const InboxHeader = ({
  mineCount,
  teamCount,
  scope,
  onScopeChange,
  slaHours,
  error,
}: {
  mineCount: number;
  teamCount: number;
  scope: InboxScope;
  onScopeChange: (s: InboxScope) => void;
  slaHours: number;
  error?: string;
}) => (
  <>
    {error && <Alert type="error" showIcon message="Không tải được hộp việc" description={error} />}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Hộp việc</h1>
        <p className="mt-1 text-[13px] text-muted">
          {mineCount} việc chờ bạn · sắp theo hạn SLA ({slaHours} giờ từ lúc giao) · phím{" "}
          <kbd className="rounded border border-line bg-white px-1 font-sans text-[11px]">J</kbd> /{" "}
          <kbd className="rounded border border-line bg-white px-1 font-sans text-[11px]">K</kbd> để chuyển việc
        </p>
      </div>
      <Segmented
        className="self-start sm:self-auto"
        value={scope}
        onChange={(v) => onScopeChange(v as InboxScope)}
        options={[
          {
            value: "mine",
            label: (
              <span>
                Của tôi <span className="tabular-nums">{mineCount}</span>
              </span>
            ),
          },
          {
            value: "team",
            label: (
              <span>
                Cả nhóm <span className="tabular-nums">{teamCount}</span>
              </span>
            ),
          },
        ]}
      />
    </div>
  </>
);
