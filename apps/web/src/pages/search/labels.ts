// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

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
