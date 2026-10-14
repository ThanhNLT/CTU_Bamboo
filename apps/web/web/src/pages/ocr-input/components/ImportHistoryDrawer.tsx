// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Drawer } from "antd";
import { FileImage } from "lucide-react";
import { Link } from "react-router";

import type { ImportRecord } from "../types";

export const ImportHistoryDrawer = ({
  open,
  total,
  items,
  onClose,
}: {
  open: boolean;
  total: number;
  items: ImportRecord[];
  onClose: () => void;
}) => (
  <Drawer title={`Lịch sử nhập (${total})`} open={open} onClose={onClose} width={420}>
    <p className="mb-3 text-[12.5px] text-muted">
      {total} phiếu trong 30 ngày · hiển thị {items.length} phiếu gần nhất
    </p>
    <ul className="m-0 list-none divide-y divide-line p-0">
      {items.map((it) => (
        <li key={it.id} className="flex items-start gap-3 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas text-muted" aria-hidden>
            <FileImage className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12.5px] text-ink">{it.file}</span>
            <span className="block truncate text-[11.5px] text-muted">
              {it.template} · {it.at}
            </span>
            {it.to ? (
              <Link
                to={it.to}
                onClick={onClose}
                className="mt-0.5 inline-block font-mono text-[12px] font-semibold text-bamboo-700 underline-offset-2 hover:underline"
              >
                {it.result}
              </Link>
            ) : (
              <span className="mt-0.5 block text-[12px] text-amber-800">{it.result}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  </Drawer>
);
