// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useLogout } from "@refinedev/core";
import { useKBar } from "@refinedev/kbar";
import { Dropdown, Popover, type MenuProps } from "antd";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  Sparkles,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useSession } from "../../auth/useSession";
import { cn } from "../../utils/cn";
import { NotificationBell } from "../notifications/Bell";
import { EXTRA_PAGES, findActive, NAV_GROUPS } from "./nav";
import { NavGate } from "./NavGate";
import { iconButtonClass, pillButtonClass } from "./styles";

type HeaderProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onOpenMobileNav: () => void;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "Nguyễn Ngọc Anh" → "NA" (hai chữ cuối, theo cách gọi tên tiếng Việt). */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** Hai nút ‹ › dạng viên thuốc: thu gọn / mở rộng menu trái. */
const SiderToggle = ({ collapsed, onCollapsedChange }: Pick<HeaderProps, "collapsed" | "onCollapsedChange">) => (
  <div className="hidden h-9 items-center rounded-full border border-line bg-white p-0.5 shadow-card md:flex">
    <button
      type="button"
      onClick={() => onCollapsedChange(true)}
      disabled={collapsed}
      aria-label="Thu gọn menu"
      className="grid h-8 w-8 place-items-center rounded-full text-body hover:bg-black/5 disabled:cursor-default disabled:text-muted/50 disabled:hover:bg-transparent"
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => onCollapsedChange(false)}
      disabled={!collapsed}
      aria-label="Mở rộng menu"
      className="grid h-8 w-8 place-items-center rounded-full text-body hover:bg-black/5 disabled:cursor-default disabled:text-muted/50 disabled:hover:bg-transparent"
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  </div>
);

const Breadcrumb = () => {
  const { pathname } = useLocation();
  const active = findActive(pathname);
  return (
    <nav aria-label="Vị trí" className="min-w-0 leading-tight">
      <div className="truncate text-[11px] text-muted">{active?.group ?? "Bamboo"}</div>
      <div className="truncate text-[13.5px] font-semibold text-ink" aria-current="page">
        {active?.label ?? "Trang"}
      </div>
    </nav>
  );
};

/** Ô "Tìm mọi thứ": mở bảng lệnh (Refine Kbar), cùng phím tắt ⌘K / Ctrl K. */
const SearchTrigger = () => {
  const { query } = useKBar();
  return (
    <button
      type="button"
      onClick={() => query.toggle()}
      className="hidden h-9 w-full max-w-[340px] items-center gap-2 rounded-full border border-line bg-canvas px-3.5 text-left text-[13px] text-muted transition-colors hover:border-bamboo-200 hover:bg-white lg:flex"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">Tìm mọi thứ</span>
      <kbd className="rounded-md border border-line bg-white px-1.5 py-px font-sans text-[11px] text-muted">
        {IS_MAC ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
};

const CompanySwitcher = () => {
  const { tenant, tenants, switchTenant } = useSession();
  const items: MenuProps["items"] = tenants.map((t) => ({
    key: t.tenant_id,
    label: t.tenant_name,
    icon:
      t.tenant_id === tenant.tenant_id ? <Check className="h-3.5 w-3.5" /> : <span className="inline-block w-3.5" />,
    onClick: () => t.tenant_id !== tenant.tenant_id && switchTenant(t.tenant_id),
  }));

  // Tenant hiện tại luôn hiển thị (UI-04).
  return (
    <Dropdown menu={{ items, selectedKeys: [tenant.tenant_id] }} trigger={["click"]} placement="bottomRight">
      <button
        type="button"
        className={cn(pillButtonClass, "max-w-[240px]")}
        aria-label={`Đơn vị: ${tenant.tenant_name}`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
        <span className="hidden truncate sm:inline">{tenant.tenant_name}</span>
        {tenants.length > 1 && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
      </button>
    </Dropdown>
  );
};

/** Bảng Ứng dụng: mọi phân hệ, kể cả trang chưa có trên menu trái. */
const AppLauncher = () => {
  const content = (
    <div className="w-[320px] space-y-3 p-1">
      <div className="grid grid-cols-3 gap-1">
        {NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, access: i.access ?? g.access }))).map(
          ({ key, label, to, icon: Icon, access }) => (
            <NavGate key={key} access={access}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-[11.5px] leading-tight text-body hover:bg-bamboo-50 hover:text-ink"
              >
                <Icon className="h-5 w-5 text-bamboo-700" strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            </NavGate>
          ),
        )}
      </div>
      <div className="border-t border-line pt-2">
        {EXTRA_PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            className="block rounded-lg px-2 py-1.5 text-[13px] text-body hover:bg-bamboo-50 hover:text-ink"
          >
            {p.label} <span className="text-muted">· {p.group}</span>
          </Link>
        ))}
      </div>
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight" arrow={false}>
      <button type="button" className={iconButtonClass} aria-label="Ứng dụng">
        <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </Popover>
  );
};

const UserMenu = () => {
  const { tenant } = useSession();
  const { mutate: logout } = useLogout();
  const items: MenuProps["items"] = [
    {
      key: "me",
      disabled: true,
      label: (
        <div className="py-0.5 leading-tight">
          <div className="text-[13px] font-semibold text-ink">{tenant.full_name}</div>
          <div className="text-[11.5px] text-muted">{tenant.tenant_name}</div>
        </div>
      ),
    },
    { type: "divider" },
    { key: "logout", icon: <LogOut className="h-3.5 w-3.5" />, label: "Đăng xuất", onClick: () => logout() },
  ];
  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <button
        type="button"
        aria-label={`Tài khoản: ${tenant.full_name}`}
        className="grid h-9 w-9 place-items-center rounded-full bg-bamboo-600 text-[12.5px] font-semibold text-white ring-2 ring-white transition-colors hover:bg-bamboo-700"
      >
        {initials(tenant.full_name)}
      </button>
    </Dropdown>
  );
};

export const AppHeader = ({ collapsed, onCollapsedChange, onOpenMobileNav }: HeaderProps) => {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur-md md:px-5">
      <button type="button" className={cn(iconButtonClass, "md:hidden")} onClick={onOpenMobileNav} aria-label="Mở menu">
        <Menu className="h-5 w-5" />
      </button>
      <SiderToggle collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
      <Breadcrumb />

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <SearchTrigger />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <CompanySwitcher />
        <button type="button" className={cn(pillButtonClass, "max-sm:hidden")} onClick={() => navigate("/i/assistant")}>
          <Sparkles className="h-4 w-4 text-bamboo-600" strokeWidth={1.75} aria-hidden />
          Trợ lý
        </button>
        <AppLauncher />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
};
