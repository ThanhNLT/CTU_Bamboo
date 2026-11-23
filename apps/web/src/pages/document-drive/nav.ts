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

import { Archive, BookOpen, Clock, Files, FolderKanban, Layers, User } from "lucide-react";

import type { DriveNavItem, ParaGroup } from "./types";
import { tr } from "../../i18n";

export const DRIVE_NAV: DriveNavItem[] = [
  { key: "mine", label: tr("Tệp tôi tải lên"), icon: User },
  { key: "all", label: tr("Mọi tệp tôi được xem"), icon: Files },
  { key: "recent", label: tr("7 ngày gần đây"), icon: Clock },
];

export const PARA_NAV: (DriveNavItem & { key: ParaGroup })[] = [
  {
    key: "PROJECTS",
    label: tr("Dự án"),
    icon: FolderKanban,
    hint: tr("Việc có đích và có hạn đang làm: dự án, chứng từ đang soạn hoặc chờ duyệt"),
  },
  {
    key: "AREAS",
    label: tr("Lĩnh vực phụ trách"),
    icon: Layers,
    hint: tr("Trách nhiệm thường xuyên: kênh phòng ban, nhóm trao đổi"),
  },
  {
    key: "RESOURCES",
    label: tr("Tài nguyên"),
    icon: BookOpen,
    hint: tr("Tài liệu tham khảo dùng chung: thư viện tri thức đang hiệu lực"),
  },
  {
    key: "ARCHIVES",
    label: tr("Lưu trữ"),
    icon: Archive,
    hint: tr("Đã xong: dự án đã đóng, chứng từ đã có kết quả, tài liệu hết hiệu lực"),
  },
];

export const PARA_LABEL = Object.fromEntries(PARA_NAV.map((n) => [n.key, n.label])) as Record<ParaGroup, string>;
