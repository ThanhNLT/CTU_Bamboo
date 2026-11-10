/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import type { ReactNode } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router";

import { primaryButtonClass } from "../components/ui/buttons";
import { useModules } from "./useModules";
import { tr } from "../i18n";

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
    <div className="mx-auto mt-16 max-w-[560px] rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-ink">
        {tr("Chức năng ")} {info?.name ?? module} {tr(" chưa được bật")}
      </p>
      <p className="mt-2 text-[13px] text-muted">
        {info?.description ? `${info.description}. ` : ""}
        {overview?.can_manage
          ? tr("Bạn có thể bật chức năng này cho công ty ở trang Quản lý chức năng.")
          : tr("Nhờ quản trị viên của công ty bật chức năng này nếu cần dùng.")}
      </p>
      {overview?.can_manage && (
        <button type="button" className={`${primaryButtonClass} mt-6`} onClick={() => navigate("/admin/modules")}>
          {tr("Mở Quản lý chức năng")}
        </button>
      )}
    </div>
  );
};
