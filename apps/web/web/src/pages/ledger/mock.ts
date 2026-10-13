// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu mẫu cho trang Sổ cái (thay cho chaincode Fabric + kho lưu trữ). Kết quả đối soát được TÍNH bằng cách
// so mã băm, không ghi tay: sửa `storedSha256` của một bản niêm phong là trang báo "Không khớp".
import type { AccessLog, ArchiveDoc, Seal, SealLogRow } from "./types";

export const SEALS: Seal[] = [
  {
    code: "HS-SEMI-2026-00125",
    version: 3,
    title: "Báo cáo sự cố phòng sạch CR-02",
    sealedAt: "12/10/2026 10:42",
    channel: "semicon",
    block: 48297,
    txId: "83457be3695e4f421d84171f73109fd2b1a426ed02f575ec256706ae231be773",
    // = SHA-256 của SAMPLE_FILE bên dưới → tải tệp mẫu rồi kéo vào để thấy "Khớp".
    sha256: "00c7c0e74ac30c1d276e6d8e1cc09e21b7990ebb7cff4b7018beaabdaee6e68d",
  },
  {
    code: "HS-SEMI-2026-00124",
    version: 1,
    title: "Phiếu xuất xưởng lô wafer W-78",
    sealedAt: "12/10/2026 10:12",
    channel: "semicon",
    block: 48291,
    txId: "9ff67ad129e978271a142eddd9e18849bc8ce72f072db187b1afc0f0f20ac13a",
    sha256: "31f62b2cf9c28cac885753f28b0984f13fbee7c9d5f917b6d25a3e00cc301148",
  },
  {
    code: "HS-HOS-2026-00072",
    version: 2,
    title: "Đề xuất mua máy thở ICU",
    sealedAt: "12/10/2026 09:58",
    channel: "hospital",
    block: 48288,
    txId: "0bdf7414e708bb6171c7a3bf3721ca37418b1f36edba6681a13adda74ebb829f",
    sha256: "1f557f71eb4807ce3957e4c7f2005d6e26908e7e0d8ae8b14006b9ce83a48c66",
  },
  {
    code: "HS-SEMI-2026-00087",
    version: 4,
    title: "Biên bản hiệu chuẩn máy đếm hạt PC-07",
    sealedAt: "12/10/2026 08:30",
    channel: "semicon",
    block: 48270,
    txId: "04fa7aaf3f4cfd21d9b232e7913fb3de5fd55c56439ba8d468ec8ac8c5c5a561",
    sha256: "9620e27c797b9b62866c8998c4311ed129a6bafe3532040bb046f9a7187b30cb",
    storedSha256: "192412f5b439652be6092ea4ddaa02d8264e264306f6b10e74686bdc35dc17be",
    resolution: "Đã xử lý · biên bản BB-SEMI-2026-014: tệp bị ghi đè khi đồng bộ, đã khôi phục bản gốc từ kho lạnh.",
  },
  {
    code: "HS-MOB-2026-00311",
    version: 2,
    title: "Yêu cầu thay đổi thiết kế ECR-88",
    sealedAt: "11/10/2026 16:05",
    channel: "mobile",
    block: 48244,
    txId: "eb6d1ad20b160e7b8fb70f287e33ac0b33e8648c757a42610883e60c1ccd74f3",
    sha256: "9cd6489929c129b952931e560eb188a29b43a455e547c40a683c75745c7e3b6b",
  },
  {
    code: "HS-SEMI-2026-00123",
    version: 3,
    title: "Biên bản bàn giao lô wafer W-77",
    sealedAt: "03/10/2026 14:22",
    channel: "semicon",
    block: 47811,
    txId: "9c1e4b9ff708335397db022bbc50bd7cdde91508a87a597521582620ad0277ab",
    sha256: "3f9a6c1d0e8b47a29f5c2e7d81b4a6f03c9e2d5b7a1f8c4e6d0b3a9f2e7cc21e",
  },
  {
    code: "HS-SEMI-2026-00123",
    version: 2,
    title: "Biên bản bàn giao lô wafer W-77",
    sealedAt: "02/10/2026 17:40",
    channel: "semicon",
    block: 47790,
    txId: "83f180c7102d0485d3673bdee0f5f5a9946664ab07d21d113ce71a20e3c8b49d",
    sha256: "0f9b5f052ae8b0aa4c48a62b77f57d0d12757d8b2fdd7432f610729dc63193d5",
  },
  {
    code: "HS-SEMI-2026-00118",
    version: 2,
    title: "Yêu cầu hiệu chuẩn máy đếm hạt bụi",
    sealedAt: "11/10/2026 11:20",
    channel: "semicon",
    block: 48231,
    txId: "fc33efadf051493b61cf84ff43844e924c1c06fd92c65e944c64bdf2f3efce64",
    sha256: "ec874fa31ab13163b04a91bbc8f27c1a20b4ae33c536e6c183d68fd85feb866d",
  },
  {
    code: "HS-SEMI-2026-00109",
    version: 1,
    title: "Đề xuất thay bộ lọc HEPA phòng sạch CR-01",
    sealedAt: "10/10/2026 15:02",
    channel: "semicon",
    block: 48160,
    txId: "1c68fe9fb95b778a5b3f7d0df5620797c4ce0abf006ee67128bc04c58c1fa934",
    sha256: "a4fbd1b8150095245fad410f87f2e86c617c91c838c73f26907ad343393fd635",
  },
  {
    code: "HS-APP-2026-00045",
    version: 1,
    title: "Đề nghị mua sắm khuôn ép nhựa",
    sealedAt: "10/10/2026 09:31",
    channel: "appliance",
    block: 48122,
    txId: "0424363cfceb5531b79036688379c2d6820b8e81881e3522dd7edee0354f2e5a",
    sha256: "5f9dd32362cc264b9a7dc5fa380b6ea4d17d9efd8643365eaa391e02fa09faf2",
  },
];

/** "Niêm phong gần đây": 5 dòng đầu như thiết kế, "Xem tất cả" hiện thêm. Kết quả = lần đối soát gần nhất. */
export const RECENT_SEALS: SealLogRow[] = [
  { code: "HS-SEMI-2026-00125", version: 3, time: "10:42", result: "match" },
  { code: "HS-SEMI-2026-00124", version: 1, time: "10:12", result: "match" },
  { code: "HS-HOS-2026-00072", version: 2, time: "09:58", result: "match" },
  { code: "HS-SEMI-2026-00087", version: 4, time: "08:30", result: "mismatch" },
  { code: "HS-MOB-2026-00311", version: 2, time: "Hôm qua", result: "match" },
  { code: "HS-SEMI-2026-00118", version: 2, time: "Hôm qua", result: "match" },
  { code: "HS-SEMI-2026-00109", version: 1, time: "10/10", result: "match" },
  { code: "HS-APP-2026-00045", version: 1, time: "10/10", result: "match" },
  { code: "HS-SEMI-2026-00123", version: 3, time: "03/10", result: "match" },
];

export const STATS = {
  sealed: 12480,
  sealedThisWeek: 214,
  verifiedToday: 36,
  matchedToday: 35,
  pendingToday: 1,
  mismatch30d: 1,
  archived: 2310,
};

export const DEFAULT_CODE = "HS-SEMI-2026-00123";

export const ARCHIVE_DOCS: ArchiveDoc[] = [
  {
    id: "lt-1",
    code: "LT-SEMI-2021-0034",
    title: "Biên bản nghiệm thu phòng sạch CR-01",
    archivedYear: 2021,
    pages: 34,
    unit: "Công ty Chip & Linh kiện",
    access: "Nội bộ",
  },
  {
    id: "lt-2",
    code: "LT-SEMI-2019-0212",
    title: "Hồ sơ dự án fab giai đoạn 1",
    archivedYear: 2019,
    pages: 212,
    unit: "Công ty Chip & Linh kiện",
    access: "Hạn chế",
  },
  {
    id: "lt-3",
    code: "LT-SEMI-2018-0006",
    title: "Quyết định thành lập Công ty Chip",
    archivedYear: 2018,
    pages: 6,
    unit: "Tập đoàn X",
    access: "Nội bộ",
  },
  {
    id: "lt-4",
    code: "LT-SEMI-2019-0148",
    title: "Hợp đồng EPC xây dựng nhà máy Bắc Ninh",
    archivedYear: 2019,
    pages: 148,
    unit: "Công ty Chip & Linh kiện",
    access: "Hạn chế",
  },
  {
    id: "lt-5",
    code: "LT-SEMI-2018-0096",
    title: "Báo cáo đánh giá tác động môi trường nhà máy chip",
    archivedYear: 2018,
    pages: 96,
    unit: "Công ty Chip & Linh kiện",
    access: "Nội bộ",
  },
  {
    id: "lt-6",
    code: "LT-SEMI-2022-0018",
    title: "Biên bản kiểm định máy đếm hạt bụi 2022",
    archivedYear: 2022,
    pages: 18,
    unit: "Tổ Đo lường",
    access: "Nội bộ",
  },
  {
    id: "lt-7",
    code: "LT-SEMI-2020-0041",
    title: "Hồ sơ cấp phép xả thải",
    archivedYear: 2020,
    pages: 41,
    unit: "Công ty Chip & Linh kiện",
    access: "Hạn chế",
  },
  {
    id: "lt-8",
    code: "LT-SEMI-2020-0064",
    title: "Sổ tay chất lượng ISO 9001 (bản 2020)",
    archivedYear: 2020,
    pages: 64,
    unit: "Phòng Quản lý chất lượng",
    access: "Nội bộ",
  },
];

export const READING_ROOM_RULES = "Đóng dấu chìm tên người xem · không cho tải xuống · ghi nhật ký truy cập";

/** 3 hồ sơ hiện trong thẻ "Phòng đọc ảo" ở tab Đối soát. */
export const FEATURED_ARCHIVE_IDS = ["lt-1", "lt-2", "lt-3"];

export const ACCESS_LOGS: AccessLog[] = [
  { id: "al-1", docTitle: "Hồ sơ dự án fab giai đoạn 1", viewer: "Trần Minh Quân", at: "12/10/2026 08:41" },
  { id: "al-2", docTitle: "Biên bản nghiệm thu phòng sạch CR-01", viewer: "Nguyễn Văn Tùng", at: "11/10/2026 16:20" },
  { id: "al-3", docTitle: "Hợp đồng EPC xây dựng nhà máy Bắc Ninh", viewer: "Lê Thu Hà", at: "11/10/2026 10:05" },
];

/** Tệp mẫu để thử đối soát bằng tệp: mã băm của nó chính là bản niêm phong HS-SEMI-2026-00125 v3. */
export const SAMPLE_FILE = {
  name: "HS-SEMI-2026-00125_v3.txt",
  content:
    "BÁO CÁO SỰ CỐ PHÒNG SẠCH CR-02\nMã hồ sơ: HS-SEMI-2026-00125 · phiên bản 3\nĐơn vị: Công ty Chip & Linh kiện · Nhà máy chip Bắc Ninh\n\nThời gian: 10/10/2026 10:12–10:29 (18 phút)\nHiện tượng: hạt bụi ≥0,5 µm vượt ngưỡng ISO 5 (3.520 hạt/m³), đỉnh 3.683 hạt/m³.\nNguyên nhân sơ bộ: chênh áp giảm còn 8 Pa từ 10:08.\n\nTệp mẫu dùng để thử chức năng đối soát của Bamboo (DX-OS Open-Core).\n",
};
