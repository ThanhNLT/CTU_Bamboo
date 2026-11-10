/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { EyeOff } from "lucide-react";

import type { ColumnDef } from "../types";
import { tr } from "../../../i18n";

const TH = "pb-2 pr-3 text-left text-[12px] font-medium text-muted";

export const SchemaTable = ({ columns }: { columns: ColumnDef[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[440px] text-[12.5px]">
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className={TH}>
            {tr("Cột")}
          </th>
          <th scope="col" className={TH}>
            {tr("Kiểu")}
          </th>
          <th scope="col" className={TH}>
            {tr("Mô tả")}
          </th>
        </tr>
      </thead>
      <tbody>
        {columns.map((c) => (
          <tr key={c.name} className="border-b border-line/70 last:border-0">
            <td className="py-2.5 pr-3 align-top font-mono text-[12px] text-ink">
              <span className="inline-flex items-center gap-1.5">
                {c.name}
                {c.pii && <EyeOff className="h-3 w-3 text-red-600" aria-label={tr("PII đã che")} />}
              </span>
            </td>
            <td className="py-2.5 pr-3 align-top font-mono text-[11.5px] text-muted">{c.type}</td>
            <td className="py-2.5 align-top text-body">{c.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
