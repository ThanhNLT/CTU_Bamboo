/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import type { MemberRole, SizeBand } from "./api";
import { tr } from "../../i18n";

export type Industry = {
  label: string;
  units: { name: string; type: string }[];
  modules: string[];
};

export const INDUSTRIES: Industry[] = [
  {
    label: tr("Thương mại & bán lẻ"),
    units: [
      { name: tr("Phòng Kinh doanh"), type: "PHONG" },
      { name: tr("Kho vận"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
    ],
    modules: ["procurement", "files"],
  },
  {
    label: tr("Sản xuất"),
    units: [
      { name: tr("Phòng Kế hoạch"), type: "PHONG" },
      { name: tr("Phòng Mua hàng"), type: "PHONG" },
      { name: tr("Nhà máy"), type: "NHA_MAY" },
      { name: tr("Phòng Kỹ thuật – Chất lượng"), type: "PHONG" },
      { name: tr("Kho vận"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
      { name: tr("Phòng Hành chính – Nhân sự"), type: "PHONG" },
    ],
    modules: ["procurement", "hr", "files", "process"],
  },
  {
    label: tr("Xây dựng & bất động sản"),
    units: [
      { name: tr("Phòng Kỹ thuật"), type: "PHONG" },
      { name: tr("Đội thi công"), type: "DOI" },
      { name: tr("Phòng Mua hàng"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
      { name: tr("Phòng Hành chính – Nhân sự"), type: "PHONG" },
    ],
    modules: ["procurement", "hr", "files"],
  },
  {
    label: tr("Công nghệ & dịch vụ số"),
    units: [
      { name: tr("Phát triển sản phẩm"), type: "PHONG" },
      { name: tr("Phòng Kinh doanh"), type: "PHONG" },
      { name: tr("Chăm sóc khách hàng"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
      { name: tr("Phòng Hành chính – Nhân sự"), type: "PHONG" },
    ],
    modules: ["files", "process", "knowledge"],
  },
  {
    label: tr("Y tế & chăm sóc sức khỏe"),
    units: [
      { name: tr("Khoa Khám bệnh"), type: "KHOA" },
      { name: tr("Khoa Dược"), type: "KHOA" },
      { name: tr("Phòng Hành chính"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
    ],
    modules: ["procurement", "hr", "files"],
  },
  {
    label: tr("Giáo dục & đào tạo"),
    units: [
      { name: tr("Phòng Đào tạo"), type: "PHONG" },
      { name: tr("Phòng Tuyển sinh"), type: "PHONG" },
      { name: tr("Phòng Hành chính"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
    ],
    modules: ["files", "knowledge"],
  },
  {
    label: tr("Nhà hàng & ăn uống"),
    units: [
      { name: tr("Bếp"), type: "PHONG" },
      { name: tr("Phục vụ"), type: "PHONG" },
      { name: "Kho", type: "PHONG" },
      { name: tr("Kế toán"), type: "PHONG" },
    ],
    modules: ["procurement"],
  },
  {
    label: tr("Vận tải & logistics"),
    units: [
      { name: tr("Phòng Điều phối"), type: "PHONG" },
      { name: tr("Đội xe"), type: "DOI" },
      { name: tr("Kho vận"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
    ],
    modules: ["procurement", "files"],
  },
  {
    label: tr("Nông nghiệp"),
    units: [
      { name: tr("Sản xuất"), type: "PHONG" },
      { name: tr("Phòng Kinh doanh"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
    ],
    modules: ["procurement"],
  },
  {
    label: tr("Lĩnh vực khác"),
    units: [
      { name: tr("Phòng Kinh doanh"), type: "PHONG" },
      { name: tr("Phòng Kế toán"), type: "PHONG" },
      { name: tr("Phòng Hành chính – Nhân sự"), type: "PHONG" },
    ],
    modules: ["files"],
  },
];

export const industryOf = (label?: string) => INDUSTRIES.find((i) => i.label === label);

export const UNIT_TYPES: { value: string; label: string }[] = [
  { value: "PHONG", label: tr("Phòng") },
  { value: "KHOI", label: tr("Khối") },
  { value: "VAN_PHONG", label: tr("Văn phòng") },
  { value: "CHI_NHANH", label: tr("Chi nhánh") },
  { value: "NHA_MAY", label: tr("Nhà máy") },
  { value: "PHAN_XUONG", label: tr("Phân xưởng") },
  { value: "TRUNG_TAM", label: tr("Trung tâm") },
  { value: "DOI", label: tr("Đội") },
  { value: "KHOA", label: "Khoa" },
];

export const SIZES: { value: SizeBand; label: string; hint: string; flow: "quick" | "detailed" }[] = [
  { value: "1-10", label: tr("1–10 người"), hint: tr("Hộ kinh doanh, công ty một thành viên"), flow: "quick" },
  { value: "11-50", label: tr("11–50 người"), hint: tr("Doanh nghiệp nhỏ"), flow: "quick" },
  { value: "51-200", label: tr("51–200 người"), hint: tr("Doanh nghiệp vừa, có phòng ban"), flow: "detailed" },
  { value: "200+", label: tr("Trên 200 người"), hint: tr("Doanh nghiệp lớn, tập đoàn"), flow: "detailed" },
];

export const ROLES: { value: MemberRole; label: string; description: string }[] = [
  { value: "STAFF", label: tr("Nhân viên"), description: tr("Lập đề nghị, xem việc của mình") },
  { value: "MANAGER", label: tr("Trưởng bộ phận"), description: tr("Duyệt đề nghị của người trong bộ phận") },
  {
    value: "ACCOUNTANT",
    label: tr("Kế toán / kiểm soát"),
    description: tr("Xem chứng từ toàn công ty, nhật ký kiểm toán"),
  },
  {
    value: "ADMIN",
    label: tr("Quản trị viên"),
    description: tr("Cơ cấu tổ chức, người dùng, phân quyền, công cụ; bắt buộc xác thực hai lớp"),
  },
];

export const HEAVY_MODULES = new Set(["data", "ai"]);

const ascii = (s: string) =>
  s
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim();

export const suggestUsername = (fullName: string, taken: Set<string>) => {
  const words = ascii(fullName).split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  let base = words.length === 1 ? words[0] : `${words[words.length - 1]}.${words[0]}`;
  if (base.length < 3) base = `${base}.bb`;
  base = base.slice(0, 50);
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}${n}`;
  return name;
};
