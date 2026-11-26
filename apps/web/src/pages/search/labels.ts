/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import type { Company, ResultType } from "./types";
import { tr } from "../../i18n";

export const TYPE_LABEL: Record<ResultType, string> = {
  record: tr("Hồ sơ"),
  document: tr("Tài liệu"),
  knowledge: tr("Tri thức"),
  twin: tr("Bản sao số"),
  data: tr("Dữ liệu"),
};

export const COMPANY_LABEL: Record<Company, string> = {
  chip: tr("Chip & Linh kiện"),
  phone: tr("Điện thoại"),
  appliance: tr("Gia dụng"),
  hospital: tr("Bệnh viện"),
};

export const DEFAULT_TYPES: ResultType[] = ["record", "document", "knowledge", "twin", "data"];
export const EXAMPLE_QUERIES = [tr("phòng sạch"), tr("mua sắm"), "CR-02", "wf_task"];
