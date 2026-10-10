// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { FORMS } from "../mock";
import type { ProcessModel } from "../types";

/** Tab "Biểu mẫu": các biểu mẫu và bước nào trong quy trình đang dùng chúng (xem trước, chưa sửa được). */
export const FormsTab = ({ model }: { model: ProcessModel }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
    {FORMS.map((f) => {
      const usedBy = model.nodes.filter((n) => n.form === f.id).map((n) => n.name);
      return (
        <section key={f.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <h2 className="text-[14px] font-semibold text-ink">{f.name}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {usedBy.length ? `Dùng ở: ${usedBy.join(", ")}` : "Chưa dùng trong quy trình này"}
          </p>
          <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
            {f.fields.map((fd) => (
              <li key={fd.label} className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-2.5 py-1.5 text-[12.5px]">
                <span className="truncate text-ink">
                  {fd.label}
                  {fd.required && <span className="text-red-600" aria-label="bắt buộc"> *</span>}
                </span>
                <span className="shrink-0 text-[11px] text-muted">{fd.type}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    })}
  </div>
);
