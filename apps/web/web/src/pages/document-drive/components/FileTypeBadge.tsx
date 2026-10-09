// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import { fileExtension } from "../utils";

// Màu nhạt theo nhóm định dạng; luôn kèm chữ viết tắt nên không chỉ dựa vào màu.
const KIND: Array<{ exts: string[]; label?: string; className: string }> = [
  { exts: ["pdf"], className: "bg-red-50 text-red-700 border-red-100" },
  { exts: ["png", "jpg", "jpeg", "gif", "webp", "svg"], className: "bg-violet-50 text-violet-700 border-violet-100" },
  { exts: ["xls", "xlsx", "csv"], label: "XLS", className: "bg-bamboo-50 text-bamboo-700 border-bamboo-100" },
  { exts: ["doc", "docx", "odt"], label: "DOC", className: "bg-sky-50 text-sky-700 border-sky-100" },
];

export const FileTypeBadge = ({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) => {
  const ext = fileExtension(name);
  const kind = KIND.find((k) => k.exts.includes(ext));
  const label = (kind?.label ?? ext.slice(0, 4) ?? "FILE").toUpperCase() || "FILE";
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-md border font-bold tracking-tight",
        size === "sm" ? "h-7 w-7 text-[8px]" : "h-11 w-11 rounded-xl text-[10.5px]",
        kind?.className ?? "border-line bg-canvas text-muted",
      )}
    >
      {label}
    </span>
  );
};
