// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ImportRecord, OcrField } from "./types";

export const SAMPLE_DOC = { kind: "sample" as const, name: "phieu-yeu-cau-bao-tri.jpg", sizeLabel: "1,2 MB", pages: 1 };

export const TEMPLATE = {
  name: "Phiếu yêu cầu bảo trì (BM-BT-02)",
  code: "BM-BT-02",
  company: "Công ty Chip & Linh kiện",
  match: 0.94,
  engines: "Tesseract + PaddleOCR",
};

export const RECORD_TYPES = ["Yêu cầu bảo trì thiết bị", "Báo cáo sự cố", "Đề nghị mua sắm", "Biên bản bàn giao"];
export const PRIORITIES = ["Cao", "Trung bình", "Thấp"];

export const OCR_FIELDS: OcrField[] = [
  {
    key: "docNo",
    label: "Số phiếu",
    raw: "BT-2026-0918",
    value: "BT-2026-0918",
    confidence: 0.98,
    bbox: { x: 34, y: 57, w: 80, h: 17 },
  },
  {
    key: "date",
    label: "Ngày lập",
    raw: "02/10/2026",
    value: "02/10/2026",
    confidence: 0.95,
    bbox: { x: 84, y: 96, w: 66, h: 17 },
  },
  {
    key: "unit",
    label: "Đơn vị yêu cầu",
    raw: "Phòng Kỹ thuật phòng sạch",
    value: "Phòng Kỹ thuật phòng sạch",
    confidence: 0.92,
    bbox: { x: 84, y: 119, w: 142, h: 17 },
  },
  {
    key: "device",
    label: "Thiết bị",
    raw: "Máy khắc plasma PE-04",
    value: "Máy khắc plasma PE-04",
    confidence: 0.88,
    bbox: { x: 84, y: 142, w: 124, h: 17 },
  },
  {
    key: "description",
    label: "Mô tả sự cố",
    raw: "Nhiệt độ buồng tăng bất thường, báo lỗi E-217",
    value: "Nhiệt độ buồng tăng bất thường, báo lỗi E-217",
    confidence: 0.71,
    bbox: { x: 84, y: 165, w: 224, h: 17 },
  },
  {
    key: "priority",
    label: "Mức ưu tiên",
    raw: "☒ Cao   ☐ Trung bình",
    value: "Cao",
    confidence: 0.64,
    bbox: { x: 84, y: 188, w: 112, h: 17 },
  },
  {
    key: "requester",
    label: "Người đề nghị",
    raw: "Tr~ V. ~",
    value: "",
    confidence: 0.41,
    bbox: { x: 84, y: 268, w: 56, h: 19 },
  },
  {
    key: "signature",
    label: "Chữ ký",
    raw: "✓ có chữ ký",
    value: "yes",
    confidence: 0.93,
    bbox: { x: 84, y: 293, w: 72, h: 19 },
  },
];

export const NEXT_RECORD_CODE = "HS-SEMI-2026-00132";

export const IMPORT_COUNT = 24;

export const IMPORT_HISTORY: ImportRecord[] = [
  {
    id: "ih-1",
    file: "bien-ban-ban-giao-W77.jpg",
    template: "Biên bản bàn giao (BM-BG-01)",
    at: "Hôm nay 08:41",
    result: "HS-SEMI-2026-00123",
    to: "/d/ledger?doc=HS-SEMI-2026-00123",
  },
  {
    id: "ih-2",
    file: "phieu-hieu-chuan-PC07.jpg",
    template: "Phiếu hiệu chuẩn (BM-HC-03)",
    at: "Hôm qua 16:20",
    result: "HS-SEMI-2026-00118",
    to: "/p/records",
  },
  {
    id: "ih-3",
    file: "de-nghi-mua-khuon.pdf",
    template: "Đề nghị mua sắm (BM-MS-01)",
    at: "Hôm qua 10:05",
    result: "HS-APP-2026-00045",
    to: "/p/records",
  },
  { id: "ih-4", file: "IMG_2041.jpg", template: "Không nhận ra mẫu", at: "10/10 14:32", result: "Bỏ qua · ảnh mờ" },
  {
    id: "ih-5",
    file: "phieu-yeu-cau-bao-tri-CR01.jpg",
    template: "Phiếu yêu cầu bảo trì (BM-BT-02)",
    at: "10/10 09:12",
    result: "HS-SEMI-2026-00109",
    to: "/p/records",
  },
  {
    id: "ih-6",
    file: "bao-cao-su-co-SMT02.jpg",
    template: "Báo cáo sự cố (BM-SC-01)",
    at: "01/10 15:47",
    result: "HS-MOB-2026-00305",
    to: "/p/tasks",
  },
];
