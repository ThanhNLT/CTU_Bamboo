// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router";

import { primaryButtonClass } from "../components/ui/buttons";
import { useModules } from "./useModules";

/** Trang của mô-đun chưa bật cho công ty: báo rõ thay vì để trang gọi API rồi lỗi (ADR #56). */
export const RequireModule = ({ module, children }: { module: string; children: ReactNode }) => {
  const { overview, ready, enabled } = useModules();
  const navigate = useNavigate();
  if (!ready)
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  if (enabled(module)) return <>{children}</>;
  const info = overview?.modules.find((m) => m.code === module);
  return (
    <div className="mx-auto mt-16 max-w-[560px] rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-ink">Chức năng {info?.name ?? module} chưa được bật</p>
      <p className="mt-2 text-[13px] text-muted">
        {info?.description ? `${info.description}. ` : ""}
        {overview?.can_manage
          ? "Bạn có thể bật chức năng này cho công ty ở trang Quản lý chức năng."
          : "Nhờ quản trị viên của công ty bật chức năng này nếu cần dùng."}
      </p>
      {overview?.can_manage && (
        <button type="button" className={`${primaryButtonClass} mt-6`} onClick={() => navigate("/admin/modules")}>
          Mở Quản lý chức năng
        </button>
      )}
    </div>
  );
};
