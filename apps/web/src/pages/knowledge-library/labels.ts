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

import type { DocCategory, ScopeFilter } from "./types";
import { tr, trs } from "../../i18n";

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  regulation: tr("Quy chế"),
  sop: tr("Quy trình chuẩn (SOP)"),
  guide: tr("Hướng dẫn"),
  faq: tr("Hỏi đáp"),
};

export const CATEGORY_SHORT: Record<DocCategory, string> = {
  regulation: tr("Quy chế"),
  sop: tr("Quy trình chuẩn"),
  guide: tr("Hướng dẫn"),
  faq: tr("Hỏi đáp"),
};

export const SCOPE_OPTIONS: Array<{ label: string; value: ScopeFilter }> = [
  { label: tr("Tất cả"), value: "all" },
  { label: tr("Tập đoàn"), value: "group" },
  { label: tr("Công ty của tôi"), value: "company" },
];

export const SCOPE_LABEL = { group: tr("Cả tập đoàn"), company: tr("Trong công ty ban hành") } as const;

export const PROPOSAL_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: tr("Nháp"), color: "default" },
  PENDING: { label: tr("Chờ duyệt"), color: "processing" },
  RETURNED: { label: tr("Bị trả về"), color: "warning" },
  APPROVED: { label: tr("Đã xuất bản"), color: "success" },
  REJECTED: { label: trs("Từ chối"), color: "error" },
  CANCELLED: { label: tr("Đã hủy"), color: "default" },
  RETIRED: { label: tr("Ngừng hiệu lực"), color: "default" },
};
