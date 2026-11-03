// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Clock, Files, User } from "lucide-react";

import type { DriveNavItem } from "./types";
import { tr } from "../../i18n";

export const DRIVE_NAV: DriveNavItem[] = [
  { key: "mine", label: tr("Tệp tôi tải lên"), icon: User },
  { key: "all", label: tr("Mọi tệp tôi được xem"), icon: Files },
  { key: "recent", label: tr("7 ngày gần đây"), icon: Clock },
];
