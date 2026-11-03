// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";

export const AdminHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
      <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
  </div>
);

export const NoAccess = ({ permission }: { permission: string }) => (
  <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
    <p className="text-[13.5px] font-medium text-ink">Bạn chưa có quyền quản trị mục này.</p>
    <p className="mt-1 text-[12.5px] text-muted">
      Cần quyền <code className="rounded bg-canvas px-1 font-mono text-[12px]">{permission}</code> — nhờ quản trị viên
      của tenant cấp vai trò cho vị trí của bạn.
    </p>
  </div>
);
