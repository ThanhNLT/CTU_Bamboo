// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { createContext } from "react"; // React

// ===== Kiểu dữ liệu =====
export type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
};

// ===== Ngữ cảnh (Context) =====
export const ColorModeContext = createContext<ColorModeContextType>({} as ColorModeContextType);
