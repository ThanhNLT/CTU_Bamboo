// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import {
  Activity,
  ArrowLeftRight,
  Blocks,
  BellRing,
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
  Mail,
  ListTree,
  Lock,
  Network,
  Route,
  ScrollText,
  ScanText,
  Search,
  ShieldCheck,
  Shuffle,
  ShoppingCart,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: number;
  access?: { resource: string; action: string };
  /** Mô-đun chức năng chứa mục này (ADR #56); bỏ trống là phần lõi, luôn hiện */
  module?: string;
};

export type NavGroup = {
  code: string;
  label: string;
  items: NavItem[];
  access?: { resource: string; action: string };
};

export const NAV_GROUPS: NavGroup[] = [
  {
    code: "H",
    label: "Con người số",
    items: [
      { key: "home", label: "Trang chủ", to: "/", icon: House },
      { key: "drive", label: "Ổ đĩa tài liệu", to: "/h/drive", icon: FolderClosed, module: "files" },
      { key: "library", label: "Thư viện tri thức", to: "/h/library", icon: LibraryBig, module: "knowledge" },
      {
        key: "onboarding",
        label: "Tiếp nhận nhân sự",
        to: "/h/onboarding",
        icon: UserPlus,
        module: "hr",
        access: { resource: "hr_onboarding_request", action: "list" },
      },
      {
        key: "transfer",
        label: "Điều chuyển nhân sự",
        to: "/h/transfer",
        icon: Shuffle,
        module: "hr",
        access: { resource: "hr_transfer_request", action: "list" },
      },
      { key: "decisions", label: "Quyết định nhân sự", to: "/h/decisions", icon: ScrollText, module: "hr" },
      { key: "notify-settings", label: "Thông báo ngoài ứng dụng", to: "/settings/notifications", icon: BellRing },
    ],
  },
  {
    code: "P",
    label: "Quy trình số",
    items: [
      { key: "records", label: "Hồ sơ", to: "/p/records", icon: FileText, module: "approval" },
      { key: "inbox", label: "Hộp việc", to: "/p/tasks", icon: Inbox, module: "approval" },
      { key: "process", label: "Thiết kế quy trình", to: "/p/process", icon: Route, module: "process" },
      { key: "purchase", label: "Đề nghị mua sắm", to: "/p/documents", icon: ShoppingCart, module: "procurement" },
      { key: "ic-orders", label: "Đơn hàng nội bộ", to: "/p/ic-orders", icon: ArrowLeftRight, module: "ic" },
    ],
  },
  {
    code: "D",
    label: "Dữ liệu số",
    items: [
      { key: "ops", label: "Trung tâm điều hành", to: "/d/ops", icon: Gauge, module: "data" },
      { key: "twin", label: "Bản sao số", to: "/d/twin", icon: Cpu, module: "data" },
      { key: "data-services", label: "Dịch vụ dữ liệu", to: "/d/services", icon: Database, module: "data" },
      { key: "lineage", label: "Phả hệ dữ liệu", to: "/d/lineage", icon: GitFork, module: "data" },
      { key: "ledger", label: "Sổ cái", to: "/d/ledger", icon: Lock, module: "ledger" },
    ],
  },
  {
    code: "I",
    label: "Trí tuệ số",
    items: [
      { key: "assistant", label: "Trợ lý đa năng", to: "/i/assistant", icon: Sparkles, module: "ai" },
      { key: "search", label: "Tìm kiếm", to: "/i/search", icon: Search, module: "search" },
      { key: "ocr", label: "Nhập liệu OCR", to: "/i/ocr", icon: ScanText, module: "ai" },
      { key: "agents", label: "Tác tử AI", to: "/i/agents", icon: Bot, module: "ai" },
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
        key: "admin-modules",
        label: "Quản lý chức năng",
        to: "/admin/modules",
        icon: Blocks,
        access: { resource: "admin_modules", action: "list" },
      },
      {
        key: "admin-catalog",
        label: "Danh mục & dữ liệu chủ",
        to: "/admin/catalog",
        icon: ListTree,
        access: { resource: "admin_catalog", action: "list" },
      },
      {
        key: "admin-queue",
        label: "Hàng đợi tin nhắn",
        to: "/admin/queue",
        icon: Mail,
        access: { resource: "admin_queue", action: "list" },
      },
      {
        key: "admin-ops",
        label: "Vận hành hệ thống",
        to: "/admin/ops",
        icon: Activity,
        access: { resource: "admin_ops", action: "list" },
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

export const EXTRA_PAGES: Array<{ group: string; label: string; to: string }> = [
  { group: "Quy trình số", label: "Hộp việc duyệt (dữ liệu thật)", to: "/p/inbox" },
];

const matches = (pathname: string, to: string) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

export const findActive = (pathname: string): { group: string; label: string; key?: string } | undefined => {
  let best: { group: string; label: string; key?: string; to: string } | undefined;
  const consider = (group: string, label: string, to: string, key?: string) => {
    if (matches(pathname, to) && (!best || to.length > best.to.length)) best = { group, label, key, to };
  };
  NAV_GROUPS.forEach((g) => g.items.forEach((i) => consider(g.label, i.label, i.to, i.key)));
  EXTRA_PAGES.forEach((p) => consider(p.group, p.label, p.to));
  return best;
};
