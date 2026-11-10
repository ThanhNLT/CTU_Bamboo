import {
  Activity,
  ArrowLeftRight,
  Blocks,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  BellRing,
  Bot,
  Cpu,
  Database,
  FileText,
  FolderClosed,
  FolderKanban,
  Gauge,
  GitFork,
  House,
  Inbox,
  KeyRound,
  LibraryBig,
  Mail,
  ListTree,
  Lock,
  MessagesSquare,
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
  Waypoints,
} from "lucide-react";
import { tr } from "../../i18n";

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
    code: "daily",
    label: tr("Làm việc hằng ngày"),
    items: [
      { key: "home", label: tr("Trang chủ"), to: "/", icon: House },
      { key: "inbox", label: tr("Hộp việc"), to: "/p/tasks", icon: Inbox, module: "approval" },
      { key: "chat", label: tr("Tin nhắn"), to: "/h/chat", icon: MessagesSquare },
      { key: "calendar", label: tr("Lịch công tác"), to: "/h/calendar", icon: CalendarDays },
      { key: "search", label: tr("Tìm kiếm"), to: "/i/search", icon: Search, module: "search" },
      { key: "assistant", label: tr("Trợ lý đa năng"), to: "/i/assistant", icon: Sparkles, module: "ai" },
    ],
  },
  {
    code: "process",
    label: tr("Hồ sơ & quy trình"),
    items: [
      { key: "records", label: tr("Hồ sơ"), to: "/p/records", icon: FileText, module: "approval" },
      { key: "purchase", label: tr("Đề nghị mua sắm"), to: "/p/documents", icon: ShoppingCart, module: "procurement" },
      { key: "ic-orders", label: tr("Đơn hàng nội bộ"), to: "/p/ic-orders", icon: ArrowLeftRight, module: "ic" },
      { key: "projects", label: tr("Dự án và kế hoạch"), to: "/p/projects", icon: FolderKanban, module: "project" },
      { key: "process", label: tr("Thiết kế quy trình"), to: "/p/process", icon: Route, module: "process" },
    ],
  },
  {
    code: "knowledge",
    label: tr("Tài liệu & tri thức"),
    items: [
      { key: "drive", label: tr("Ổ đĩa tài liệu"), to: "/h/drive", icon: FolderClosed, module: "files" },
      { key: "library", label: tr("Thư viện tri thức"), to: "/h/library", icon: LibraryBig, module: "knowledge" },
      { key: "ocr", label: tr("Nhập liệu OCR"), to: "/i/ocr", icon: ScanText, module: "ai" },
      {
        key: "agents",
        label: tr("Tác tử AI"),
        to: "/i/agents",
        icon: Bot,
        module: "ai",
        access: { resource: "ai_agents", action: "list" },
      },
    ],
  },
  {
    code: "people",
    label: tr("Nhân sự"),
    items: [
      {
        key: "onboarding",
        label: tr("Tiếp nhận nhân sự"),
        to: "/h/onboarding",
        icon: UserPlus,
        module: "hr",
        access: { resource: "hr_onboarding_request", action: "list" },
      },
      {
        key: "transfer",
        label: tr("Điều chuyển nhân sự"),
        to: "/h/transfer",
        icon: Shuffle,
        module: "hr",
        access: { resource: "hr_transfer_request", action: "list" },
      },
      { key: "decisions", label: tr("Quyết định nhân sự"), to: "/h/decisions", icon: ScrollText, module: "hr" },
    ],
  },
  {
    code: "data",
    label: tr("Dữ liệu & điều hành"),
    items: [
      { key: "ops", label: tr("Trung tâm điều hành"), to: "/d/ops", icon: Gauge, module: "data" },
      { key: "twin", label: tr("Bản sao số"), to: "/d/twin", icon: Cpu, module: "data" },
      { key: "data-services", label: tr("Dịch vụ dữ liệu"), to: "/d/services", icon: Database, module: "data" },
      { key: "bi", label: tr("Phân tích BI"), to: "/i/bi", icon: ChartNoAxesCombined, module: "data" },
      { key: "lineage", label: tr("Phả hệ dữ liệu"), to: "/d/lineage", icon: GitFork, module: "data" },
      { key: "api-portal", label: tr("Cổng dịch vụ API"), to: "/d/api", icon: Waypoints },
      { key: "ledger", label: tr("Sổ cái"), to: "/d/ledger", icon: Lock, module: "ledger" },
    ],
  },
  {
    code: "admin",
    label: tr("Quản trị"),
    access: { resource: "admin_area", action: "list" },
    items: [
      {
        key: "admin-org",
        label: tr("Cơ cấu tổ chức"),
        to: "/admin/org",
        icon: Network,
        access: { resource: "admin_org", action: "list" },
      },
      {
        key: "admin-people",
        label: tr("Người dùng"),
        to: "/admin/people",
        icon: Users,
        access: { resource: "admin_people", action: "list" },
      },
      {
        key: "admin-roles",
        label: tr("Vai trò & phân quyền"),
        to: "/admin/roles",
        icon: KeyRound,
        access: { resource: "admin_roles", action: "list" },
      },
      {
        key: "admin-company",
        label: tr("Thông tin công ty"),
        to: "/admin/company",
        icon: Building2,
        access: { resource: "admin_company", action: "list" },
      },
      {
        key: "admin-catalog",
        label: tr("Danh mục & dữ liệu chủ"),
        to: "/admin/catalog",
        icon: ListTree,
        access: { resource: "admin_catalog", action: "list" },
      },
    ],
  },
  {
    code: "system",
    label: tr("Hệ thống & cài đặt"),
    items: [
      {
        key: "admin-modules",
        label: tr("Quản lý chức năng"),
        to: "/admin/modules",
        icon: Blocks,
        access: { resource: "admin_modules", action: "list" },
      },
      {
        key: "admin-ops",
        label: tr("Vận hành hệ thống"),
        to: "/admin/ops",
        icon: Activity,
        access: { resource: "admin_ops", action: "list" },
      },
      {
        key: "admin-queue",
        label: tr("Hàng đợi tin nhắn"),
        to: "/admin/queue",
        icon: Mail,
        access: { resource: "admin_queue", action: "list" },
      },
      {
        key: "audit",
        label: tr("Kiểm toán"),
        to: "/admin/audit-logs",
        icon: ShieldCheck,
        access: { resource: "audit_log", action: "list" },
      },
      { key: "notify-settings", label: tr("Thông báo ngoài ứng dụng"), to: "/settings/notifications", icon: BellRing },
    ],
  },
];

export const EXTRA_PAGES: Array<{ group: string; label: string; to: string }> = [
  { group: tr("Làm việc hằng ngày"), label: tr("Hộp việc duyệt (dữ liệu thật)"), to: "/p/inbox" },
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
