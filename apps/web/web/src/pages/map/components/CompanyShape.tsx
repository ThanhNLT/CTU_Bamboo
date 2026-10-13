// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Module nội bộ =====
import { COMPANY_STYLE } from "../mock";
import type { CompanyKey } from "../types";

// ===== Component =====
/** Hình đại diện công ty (vuông · thoi · tròn · chữ thập), tô màu nhận diện. */
export const CompanyShape = ({ company, size = 14 }: { company: CompanyKey; size?: number }) => {
  const color = COMPANY_STYLE[company].color;
  switch (company) {
    case "phone":
      return (
        <span
          className="block rounded-[3px] ring-2 ring-white"
          style={{ width: size, height: size, background: color }}
        />
      );
    case "chip":
      return (
        <span
          className="block rotate-45 rounded-[3px] ring-2 ring-white"
          style={{ width: size * 0.82, height: size * 0.82, background: color }}
        />
      );
    case "appliance":
      return (
        <span
          className="block rounded-full ring-2 ring-white"
          style={{ width: size, height: size, background: color }}
        />
      );
    case "hospital":
      return (
        <span className="relative block" style={{ width: size, height: size }}>
          <span
            className="absolute left-1/2 top-0 h-full w-[36%] -translate-x-1/2 rounded-[2px]"
            style={{ background: color }}
          />
          <span
            className="absolute left-0 top-1/2 h-[36%] w-full -translate-y-1/2 rounded-[2px]"
            style={{ background: color }}
          />
        </span>
      );
  }
};
