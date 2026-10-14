// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nhãn loại kết quả, công ty và giá trị mặc định của trang Tìm kiếm.

// ===== Module nội bộ =====
import type { Company, ResultType } from "./types";

export const TYPE_LABEL: Record<ResultType, string> = {
  record: "Hồ sơ",
  document: "Tài liệu",
  knowledge: "Tri thức",
  twin: "Bản sao số",
  data: "Dữ liệu",
};

export const COMPANY_LABEL: Record<Company, string> = {
  chip: "Chip & Linh kiện",
  phone: "Điện thoại",
  appliance: "Gia dụng",
  hospital: "Bệnh viện",
};

/** Bộ lọc mặc định như thiết kế: bỏ chọn "Dữ liệu" (và "Gia dụng" khi được xem nhiều công ty). */
export const DEFAULT_TYPES: ResultType[] = ["record", "document", "knowledge", "twin", "data"];
export const EXAMPLE_QUERIES = ["phòng sạch", "mua sắm", "CR-02", "wf_task"];
