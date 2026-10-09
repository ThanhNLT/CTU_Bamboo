// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu minh họa cho Ổ đĩa tài liệu. Khi có API, thay bằng useList của Refine trả về cùng kiểu ./types.
import { Building2, Clock, Share2, Trash2, User, Users } from "lucide-react";
import type { DriveFile, DriveFolder, DriveNavItem, StorageSegment, UploadItem } from "./types";

export const DRIVE_NAV: DriveNavItem[] = [
  { key: "mine", label: "Của tôi", icon: User },
  { key: "department", label: "Phòng Kỹ thuật phòng sạch", icon: Users },
  { key: "company", label: "Dùng chung công ty", icon: Building2 },
  { key: "shared", label: "Được chia sẻ với tôi", icon: Share2, badge: 3 },
  { key: "recent", label: "Gần đây", icon: Clock },
  { key: "trash", label: "Thùng rác", icon: Trash2 },
];

const GB = 1_000_000_000;
const MB = 1_000_000;
const KB = 1_000;

export const STORAGE_QUOTA = 5 * GB;

export const STORAGE_SEGMENTS: StorageSegment[] = [
  { key: "docs", label: "Tài liệu", bytes: 1.1 * GB, className: "bg-bamboo-700" },
  { key: "images", label: "Hình ảnh", bytes: 0.5 * GB, className: "bg-bamboo-300" },
  { key: "other", label: "Khác", bytes: 0.2 * GB, className: "bg-gray-500" },
];

export const CURRENT_FOLDER = "Báo cáo phòng sạch";

export const MOCK_FOLDERS: DriveFolder[] = [
  { id: "f-incident", name: "Biên bản sự cố", fileCount: 12, bytes: 48 * MB },
  { id: "f-sensor", name: "Nhật ký cảm biến", fileCount: 34, bytes: 210 * MB },
  { id: "f-calib", name: "Hiệu chuẩn thiết bị", fileCount: 8, bytes: 16 * MB, sharedWith: 4 },
];

export const MOCK_FILES: DriveFile[] = [
  { id: "d1", name: "bao-cao-su-co-CR02.pdf", owner: "Trần Minh Quân", updatedAt: "2026-10-07T08:50:00+07:00", updatedLabel: "10 phút trước", bytes: 2.4 * MB, scan: "clean" },
  { id: "d2", name: "nhat-ky-cam-bien-0610.png", owner: "Nguyễn Ngọc Anh", updatedAt: "2026-10-07T08:00:00+07:00", updatedLabel: "1 giờ trước", bytes: 640 * KB, scan: "clean" },
  { id: "d3", name: "so-lieu-hat-bui-thang-9.xlsx", owner: "Lê Thu Hà", updatedAt: "2026-10-06T15:20:00+07:00", updatedLabel: "Hôm qua", bytes: 1.1 * MB, scan: "clean" },
  { id: "d4", name: "quy-trinh-tam-thoi.docx", owner: "Nguyễn Ngọc Anh", updatedAt: "2026-10-03T10:00:00+07:00", updatedLabel: "03/10/2026", bytes: 320 * KB, scan: "clean" },
  { id: "d5", name: "bao-cao-ca-dem.pdf", owner: "Phạm Đức Long", updatedAt: "2026-10-07T07:58:00+07:00", updatedLabel: "1 giờ trước", bytes: null, scan: "blocked" },
];

export const MOCK_UPLOADS: UploadItem[] = [
  { id: "u1", name: "bien-ban-0710.pdf", progress: 64, status: "uploading" },
  { id: "u2", name: "anh-hien-truong.jpg", progress: 100, status: "scanning" },
];
