// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Cấu hình menu trái theo 4 trụ: Con người số (h) · Quy trình số (p) · Dữ liệu số (d) · Trí tuệ số (i).
// Chữ cái nhóm trùng tiền tố đường dẫn. Mục chưa có trang sẽ rơi vào ErrorComponent cho tới khi được làm.
// Các phân hệ nghiệp vụ đang chạy dữ liệu thật (mua sắm, đơn nội bộ, nhân sự, kiểm toán) nằm cùng nhóm,
// ẩn theo quyền như menu cũ (accessControlProvider) — bộ kiểm thử e2e dựa vào các mục này.

// ===== Thư viện =====
import {
  ArrowLeftRight,
  Bot,
  Cpu,
  Database,
  FileText,
  FolderClosed,
  Gauge,
  GitFork,
  House,
  Inbox,
  KeyRound,
  LibraryBig,
  ListTree,
  Lock,
  Map as MapIcon,
  Network,
  Route,
  ScanText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"; // Lucide React

// ===== Kiểu dữ liệu =====
export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Số đếm cạnh mục (ví dụ số việc trong Hộp việc). */
  badge?: number;
  /** Chỉ hiện khi accessControlProvider cho phép (resource Refine + action). */
  access?: { resource: string; action: string };
};

export type NavGroup = {
  code: string;
  label: string;
  items: NavItem[];
  /** Cả nhóm chỉ hiện khi có quyền (để không còn tiêu đề nhóm trống). */
  access?: { resource: string; action: string };
};

// ===== Hằng số =====
export const NAV_GROUPS: NavGroup[] = [
  {
    code: "H",
    label: "Con người số",
    items: [
      { key: "home", label: "Trang chủ", to: "/", icon: House },
      { key: "drive", label: "Ổ đĩa tài liệu", to: "/h/drive", icon: FolderClosed },
      { key: "library", label: "Thư viện tri thức", to: "/h/library", icon: LibraryBig },
      {
        key: "onboarding",
        label: "Tiếp nhận nhân sự",
        to: "/h/onboarding",
        icon: UserPlus,
        access: { resource: "hr_onboarding_request", action: "list" },
      },
    ],
  },
  {
    code: "P",
    label: "Quy trình số",
    items: [
      { key: "records", label: "Hồ sơ", to: "/p/records", icon: FileText },
      // Số việc chờ lấy từ wf_v_inbox (AppSider → useInboxCount).
      { key: "inbox", label: "Hộp việc", to: "/p/tasks", icon: Inbox },
      { key: "process", label: "Thiết kế quy trình", to: "/p/process", icon: Route },
      { key: "purchase", label: "Đề nghị mua sắm", to: "/p/documents", icon: ShoppingCart },
      { key: "ic-orders", label: "Đơn hàng nội bộ", to: "/p/ic-orders", icon: ArrowLeftRight },
    ],
  },
  {
    code: "D",
    label: "Dữ liệu số",
    items: [
      { key: "ops", label: "Trung tâm điều hành", to: "/d/ops", icon: Gauge },
      { key: "map", label: "Bản đồ", to: "/d/map", icon: MapIcon },
      { key: "twin", label: "Bản sao số", to: "/d/twin", icon: Cpu },
      { key: "data-services", label: "Dịch vụ dữ liệu", to: "/d/services", icon: Database },
      { key: "lineage", label: "Phả hệ dữ liệu", to: "/d/lineage", icon: GitFork },
      { key: "ledger", label: "Sổ cái", to: "/d/ledger", icon: Lock },
    ],
  },
  {
    code: "I",
    label: "Trí tuệ số",
    items: [
      { key: "assistant", label: "Trợ lý đa năng", to: "/i/assistant", icon: Sparkles },
      { key: "search", label: "Tìm kiếm", to: "/i/search", icon: Search },
      { key: "ocr", label: "Nhập liệu OCR", to: "/i/ocr", icon: ScanText },
      { key: "agents", label: "Tác tử AI", to: "/i/agents", icon: Bot },
    ],
  },
  {
    code: "Q",
    label: "Quản trị",
    access: { resource: "admin_area", action: "list" },
    items: [
      {
        key: "admin-org",
        label: "Cơ cấu tổ chức",
        to: "/admin/org",
        icon: Network,
        access: { resource: "admin_org", action: "list" },
      },
      {
        key: "admin-people",
        label: "Người dùng",
        to: "/admin/people",
        icon: Users,
        access: { resource: "admin_people", action: "list" },
      },
      {
        key: "admin-roles",
        label: "Vai trò & phân quyền",
        to: "/admin/roles",
        icon: KeyRound,
        access: { resource: "admin_roles", action: "list" },
      },
      {
        key: "admin-catalog",
        label: "Danh mục & dữ liệu chủ",
        to: "/admin/catalog",
        icon: ListTree,
        access: { resource: "admin_catalog", action: "list" },
      },
      {
        key: "audit",
        label: "Kiểm toán",
        to: "/admin/audit-logs",
        icon: ShieldCheck,
        access: { resource: "audit_log", action: "list" },
      },
    ],
  },
];

// Trang đã có nhưng không nằm trên menu: vẫn cần breadcrumb và lối vào (bảng Ứng dụng ở header).
export const EXTRA_PAGES: Array<{ group: string; label: string; to: string }> = [
  { group: "Quy trình số", label: "Hộp việc duyệt (dữ liệu thật)", to: "/p/inbox" },
];

// ===== Hàm tiện ích =====
const matches = (pathname: string, to: string) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

/** Tìm mục menu đang mở (khớp tiền tố dài nhất) để tô sáng và dựng breadcrumb. */
export const findActive = (pathname: string): { group: string; label: string; key?: string } | undefined => {
  let best: { group: string; label: string; key?: string; to: string } | undefined;
  const consider = (group: string, label: string, to: string, key?: string) => {
    if (matches(pathname, to) && (!best || to.length > best.to.length)) best = { group, label, key, to };
  };
  NAV_GROUPS.forEach((g) => g.items.forEach((i) => consider(g.label, i.label, i.to, i.key)));
  EXTRA_PAGES.forEach((p) => consider(p.group, p.label, p.to));
  return best;
};
