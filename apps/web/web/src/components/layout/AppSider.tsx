// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Tooltip } from "antd";
import { Globe } from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "../../utils/cn";
import { BambooLogo } from "./BambooLogo";
import { findActive, NAV_GROUPS, type NavItem } from "./nav";

type SiderProps = { collapsed?: boolean; onNavigate?: () => void };

const SiderItem = ({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean } & SiderProps) => {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-[10px] text-[13.5px] transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
        active
          ? "bg-white font-semibold text-ink shadow-card"
          : "text-body hover:bg-white/60 hover:text-ink",
        collapsed ? "justify-center" : "px-2.5",
      )}
    >
      <Icon
        className={cn("h-[18px] w-[18px] shrink-0", active ? "text-bamboo-700" : "text-muted group-hover:text-ink")}
        strokeWidth={1.75}
        aria-hidden
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge ? (
        <span className="min-w-5 rounded-full bg-white/80 px-1.5 text-center text-[11.5px] font-medium tabular-nums text-muted">
          {item.badge}
        </span>
      ) : null}
      {collapsed && item.badge ? (
        <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-bamboo-600" aria-hidden />
      ) : null}
    </Link>
  );
  return collapsed ? <Tooltip title={item.label} placement="right">{link}</Tooltip> : link;
};

/** Nội dung menu trái: dùng cho thanh cố định (desktop) và Drawer (mobile). */
export const SiderContent = ({ collapsed = false, onNavigate }: SiderProps) => {
  const { pathname } = useLocation();
  const activeKey = findActive(pathname)?.key;

  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className={cn("flex h-16 shrink-0 items-center gap-2.5", collapsed ? "justify-center" : "px-5")}
        aria-label="Bamboo — Trang chủ"
      >
        <BambooLogo className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-[0.14em] text-ink">BAMBOO</span>
            <span className="block text-[11px] text-muted">DX-OS Open-Core</span>
          </span>
        )}
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label="Điều hướng chính">
        {NAV_GROUPS.map((group) => (
          <div key={group.code} className="mt-4 first:mt-1">
            <div
              className={cn(
                "mb-1 flex h-6 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted",
                collapsed ? "justify-center" : "px-2.5",
              )}
            >
              <span className="w-[18px] text-center text-[10.5px] text-muted/80" aria-hidden={!collapsed}>
                {group.code}
              </span>
              {!collapsed && <span className="truncate">{group.label}</span>}
            </div>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {group.items.map((item) => (
                <li key={item.key}>
                  <SiderItem item={item} active={item.key === activeKey} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 space-y-2 border-t border-line/70 py-3", collapsed ? "px-2" : "px-3")}>
        <a
          href="#design-system"
          className={cn(
            "flex h-8 items-center gap-3 rounded-[10px] text-[13px] text-body hover:bg-white/60 hover:text-ink",
            collapsed ? "justify-center" : "px-2.5",
          )}
          title="Bamboo Design System"
        >
          <Globe className="h-[17px] w-[17px] shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          {!collapsed && <span>Bamboo Design System</span>}
        </a>
        <div
          className={cn("flex items-center gap-2 text-[11.5px] text-muted", collapsed ? "justify-center" : "px-2.5")}
          title="Kết nối trực tiếp · Phiên đã xác thực MFA"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-bamboo-500 shadow-[0_0_0_3px_rgb(63_145_80/0.15)]" />
          {!collapsed && <span>Trực tiếp · Phiên MFA ✓</span>}
        </div>
      </div>
    </div>
  );
};

export const AppSider = ({ collapsed = false }: { collapsed?: boolean }) => (
  <aside
    className={cn(
      "sticky top-0 hidden h-screen shrink-0 border-r border-line md:block",
      "bg-[linear-gradient(180deg,#eaf5ec_0%,#f2f8f3_45%,#e8f3ea_100%)]",
      "transition-[width] duration-200 ease-out",
      collapsed ? "w-[76px]" : "w-[248px]",
    )}
  >
    <SiderContent collapsed={collapsed} />
  </aside>
);
