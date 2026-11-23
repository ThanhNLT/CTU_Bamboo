/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { ListChecks, Plus } from "lucide-react";
import { Link } from "react-router";

import { NavGate } from "../../../components/layout/NavGate";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { tr } from "../../../i18n";

export const AiAgentsHeader = ({ onRegister, canRegister }: { onRegister: () => void; canRegister: boolean }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Tác tử AI")}</h1>
      <p className="mt-1 text-[13px] text-muted">
        {tr("Cổng quản trị tác tử · mô hình cục bộ, công cụ, rào chắn an toàn và số liệu lượt hỏi")}
      </p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      <NavGate access={{ resource: "audit_log", action: "list" }}>
        <Link to="/admin/audit-logs" className={secondaryButtonClass}>
          <ListChecks className="h-4 w-4" aria-hidden />
          {tr("Nhật ký kiểm toán")}
        </Link>
      </NavGate>
      <button type="button" onClick={onRegister} className={primaryButtonClass} disabled={!canRegister}>
        <Plus className="h-4 w-4" aria-hidden />
        {tr("Đăng ký tác tử")}
      </button>
    </div>
  </div>
);
