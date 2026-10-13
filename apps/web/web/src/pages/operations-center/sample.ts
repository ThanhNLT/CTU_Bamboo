// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu MINH HỌA còn lại của Trung tâm điều hành: bản đồ cảnh báo thiết bị (chưa có nguồn Bản sao số / IoT).
// Mọi khối khác dùng dữ liệu thật (./useOpsData).
import type { SampleCompany, SampleCompanyKey, Site } from "./types";

/**
 * Màu nhận diện công ty — 4 ô đầu của bảng màu phân loại đã kiểm định (thứ tự cố định, không đổi theo hạng).
 * Xanh ngọc và vàng có tương phản < 3:1 trên nền trắng → luôn kèm nhãn trực tiếp hoặc dạng bảng.
 */
export const SAMPLE_COMPANIES: SampleCompany[] = [
  { key: "phone", name: "Điện thoại", short: "Điện thoại", color: "#2a78d6" },
  { key: "chip", name: "Chip & Linh kiện", short: "Chip", color: "#eb6834" },
  { key: "appliance", name: "Gia dụng", short: "Gia dụng", color: "#1baf7a" },
  { key: "hospital", name: "Bệnh viện", short: "Bệnh viện", color: "#eda100" },
];

export const SAMPLE_COMPANY: Record<SampleCompanyKey, SampleCompany> = Object.fromEntries(
  SAMPLE_COMPANIES.map((c) => [c.key, c]),
) as Record<SampleCompanyKey, SampleCompany>;

export const SITES: Site[] = [
  { id: "s1", company: "phone", name: "Nhà máy Thái Nguyên", province: "Thái Nguyên", x: 24, y: 24, status: "ok" },
  {
    id: "s2",
    company: "phone",
    name: "Trung tâm R&D",
    province: "Hà Nội",
    x: 31,
    y: 40,
    status: "warning",
    alert: "Phòng thử nghiệm: độ ẩm cao",
  },
  {
    id: "s3",
    company: "chip",
    name: "CR-02",
    province: "Bắc Ninh",
    x: 44,
    y: 55,
    status: "critical",
    alert: "Hạt bụi vượt ngưỡng ISO 5",
  },
  {
    id: "s4",
    company: "chip",
    name: "Fab 1",
    province: "Bắc Ninh",
    x: 52,
    y: 47,
    status: "warning",
    alert: "Bảo trì bơm chân không quá hạn",
  },
  { id: "s5", company: "appliance", name: "Nhà máy Hải Dương", province: "Hải Dương", x: 66, y: 30, status: "ok" },
  {
    id: "s6",
    company: "hospital",
    name: "Bệnh viện Hà Đông",
    province: "Hà Nội",
    x: 74,
    y: 66,
    status: "warning",
    alert: "Máy MRI: nhiệt độ heli tăng",
  },
];
