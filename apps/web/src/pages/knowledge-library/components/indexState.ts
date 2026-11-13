/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import type { Tone } from "../../../components/ui";
import type { IndexState } from "../types";
import { tr } from "../../../i18n";

export const VIEW: Record<IndexState["status"], { label: string; tone: Tone; text: string }> = {
  indexed: { label: tr("Đã vào chỉ mục"), tone: "success", text: "text-body" },
  indexing: { label: tr("Đang cập nhật chỉ mục"), tone: "warning", text: "text-amber-700" },
  missing: { label: tr("Chưa vào chỉ mục"), tone: "warning", text: "text-amber-700" },
  error: { label: tr("Lỗi chỉ mục"), tone: "danger", text: "text-red-700" },
};

export const indexTone = (s: IndexState) => VIEW[s.status].tone;
