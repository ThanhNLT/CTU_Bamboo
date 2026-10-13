// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Settings } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import { cn } from "../../../utils/cn";
import type { NodeType } from "../types";

// ===== Component =====
/** Biểu tượng nhỏ của từng loại phần tử BPMN (dùng ở bảng thành phần). */
export const NodeGlyph = ({ type, className }: { type: NodeType; className?: string }) => {
  const box = cn("grid h-4 w-4 shrink-0 place-items-center", className);
  switch (type) {
    case "start":
      return (
        <span className={box}>
          <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-bamboo-600" />
        </span>
      );
    case "userTask":
      return (
        <span className={box}>
          <span className="h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-ink" />
        </span>
      );
    case "serviceTask":
      return (
        <span className={box}>
          <Settings className="h-3.5 w-3.5 text-ink" strokeWidth={2} />
        </span>
      );
    case "gateway":
      return (
        <span className={box}>
          <span className="h-2.5 w-2.5 rotate-45 border-[1.5px] border-amber-500" />
        </span>
      );
    case "end":
      return (
        <span className={box}>
          <span className="h-3.5 w-3.5 rounded-full border-[3px] border-ink" />
        </span>
      );
  }
};
