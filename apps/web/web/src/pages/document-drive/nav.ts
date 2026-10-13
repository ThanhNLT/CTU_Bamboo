// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Clock, Files, User } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import type { DriveNavItem } from "./types";

// ===== Hằng số =====
export const DRIVE_NAV: DriveNavItem[] = [
  { key: "mine", label: "Tệp tôi tải lên", icon: User },
  { key: "all", label: "Mọi tệp tôi được xem", icon: Files },
  { key: "recent", label: "7 ngày gần đây", icon: Clock },
];
