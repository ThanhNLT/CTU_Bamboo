/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { useLogout } from "@refinedev/core";
import { useKBar } from "@refinedev/kbar";
import { Dropdown, Popover, type MenuProps } from "antd";
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  MonitorSmartphone,
  Moon,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { useContext } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { useSession } from "../../auth/useSession";
import { ColorModeContext } from "../../contexts/color-mode/context";
import { LOCALES, setLocale, trf, useLocale } from "../../i18n";
import { cn } from "../../utils/cn";
import { NotificationBell } from "../notifications/Bell";
import { askNotifications, notificationsSupported, useInstall } from "../../pwa";
import { OnlinePeople } from "./OnlinePeople";
import { EXTRA_PAGES, findActive, NAV_GROUPS } from "./nav";
import { BambooLogo } from "./BambooLogo";
import { NavGate } from "./NavGate";
import { iconButtonClass, pillButtonClass } from "./styles";

type HeaderProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onOpenMobileNav: () => void;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const SiderToggle = ({ collapsed, onCollapsedChange }: Pick<HeaderProps, "collapsed" | "onCollapsedChange">) => {
  const { t } = useLocale();
  return (
    <div className="hidden h-9 items-center rounded-full border border-[var(--glass-card-edge)] bg-[var(--glass-well)] p-0.5 md:flex">
      <button
        type="button"
        onClick={() => onCollapsedChange(true)}
        disabled={collapsed}
        aria-label={t("Thu gọn menu")}
        className="grid h-8 w-8 place-items-center rounded-full text-body hover:bg-[rgb(127_127_127/0.12)] disabled:cursor-default disabled:text-muted/50 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onCollapsedChange(false)}
        disabled={!collapsed}
        aria-label={t("Mở rộng menu")}
        className="grid h-8 w-8 place-items-center rounded-full text-body hover:bg-[rgb(127_127_127/0.12)] disabled:cursor-default disabled:text-muted/50 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};

const Breadcrumb = () => {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const active = findActive(pathname);
  return (
    <nav aria-label={t("Vị trí")} className="hidden min-w-0 leading-tight sm:block">
      <div className="truncate text-[11px] text-muted">{active ? t(active.group) : "Bamboo"}</div>
      <div className="truncate text-[13.5px] font-semibold text-ink" aria-current="page">
        {t(active?.label ?? "Trang")}
      </div>
    </nav>
  );
};

const SearchTrigger = () => {
  const { t } = useLocale();
  const { query } = useKBar();
  return (
    <button
      type="button"
      onClick={() => query.toggle()}
      className="hidden h-9 w-full max-w-[380px] items-center gap-2 rounded-full border border-[var(--glass-card-edge)] bg-[var(--glass-well)] px-4 text-left text-[13px] text-muted transition-colors hover:border-bamboo-200 lg:flex"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{t("Tìm mọi thứ")}</span>
      <kbd className="rounded-full border border-line px-2 py-px font-sans text-[11px] text-muted">
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

  return (
    <Dropdown menu={{ items, selectedKeys: [tenant.tenant_id] }} trigger={["click"]} placement="bottomRight">
      <button
        type="button"
        className={cn(pillButtonClass, "max-w-[240px]")}
        aria-label={trf("Đơn vị: {0}", [tenant.tenant_name])}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
        <span className="hidden truncate sm:inline">{tenant.tenant_name}</span>
        {tenants.length > 1 && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
      </button>
    </Dropdown>
  );
};

const AppLauncher = () => {
  const { t } = useLocale();
  const content = (
    <div className="w-[320px] flex flex-col gap-3 p-1">
      <div className="grid grid-cols-3 gap-1">
        {NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, access: i.access ?? g.access }))).map(
          ({ key, label, to, icon: Icon, access }) => (
            <NavGate key={key} access={access}>
              <Link
                to={to}
                className="group flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-[11.5px] font-semibold leading-tight text-ink! hover:bg-bamboo-600! hover:text-white!"
              >
                <Icon className="h-5 w-5 text-bamboo-700 group-hover:text-white" strokeWidth={1.75} aria-hidden />
                {t(label)}
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
            className="group block rounded-lg px-2 py-1.5 text-[13px] font-semibold text-ink! hover:bg-bamboo-600! hover:text-white!"
          >
            {t(p.label)} <span className="font-normal text-muted group-hover:text-white/80">· {t(p.group)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight" arrow={false}>
      <button type="button" className={iconButtonClass} aria-label={t("Ứng dụng")}>
        <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </Popover>
  );
};

const LanguageSwitch = () => {
  const { locale, t } = useLocale();
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        selectedKeys: [locale],
        items: LOCALES.map((l) => ({ key: l.code, label: l.label, onClick: () => setLocale(l.code) })),
      }}
    >
      <button type="button" className={iconButtonClass} aria-label={t("Ngôn ngữ")}>
        <span className="text-[11.5px] font-semibold uppercase">{locale}</span>
      </button>
    </Dropdown>
  );
};

const ColorModeToggle = () => {
  const { t } = useLocale();
  const { mode, setMode } = useContext(ColorModeContext);
  const dark = mode === "dark";
  return (
    <button
      type="button"
      onClick={() => setMode(dark ? "light" : "dark")}
      aria-pressed={dark}
      aria-label={t("Chế độ tối")}
      title={t(dark ? "Chế độ sáng" : "Chế độ tối")}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full transition-[background-color,box-shadow,color] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500",
        dark
          ? "bg-[linear-gradient(180deg,#3e8a4f_0%,#2f7a3e_55%,#1f5e2e_100%)] text-white shadow-glass-active ring-1 ring-white/25"
          : "text-body hover:bg-bamboo-600 hover:text-white",
      )}
    >
      {dark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
};

const UserMenu = () => {
  const { t } = useLocale();
  const { tenant } = useSession();
  const { mutate: logout } = useLogout();
  const install = useInstall();
  const canAsk = notificationsSupported() && Notification.permission === "default";
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
    ...(install
      ? [
          {
            key: "install",
            icon: <MonitorSmartphone className="h-3.5 w-3.5" />,
            label: t("Cài ứng dụng lên thiết bị"),
            onClick: () => void install(),
          },
        ]
      : []),
    ...(canAsk
      ? [
          {
            key: "notify",
            icon: <BellRing className="h-3.5 w-3.5" />,
            label: t("Bật thông báo trên thiết bị này"),
            onClick: () => void askNotifications(),
          },
        ]
      : []),
    { key: "logout", icon: <LogOut className="h-3.5 w-3.5" />, label: t("Đăng xuất"), onClick: () => logout() },
  ];
  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <button
        type="button"
        aria-label={trf("Tài khoản: {0}", [tenant.full_name])}
        className="grid h-9 w-9 place-items-center rounded-full bg-bamboo-600 text-[12.5px] font-semibold text-white shadow-glass-active transition-colors hover:bg-[#2a6e38]"
      >
        {initials(tenant.full_name)}
      </button>
    </Dropdown>
  );
};

export const AppHeader = ({ collapsed, onCollapsedChange, onOpenMobileNav }: HeaderProps) => {
  const { t } = useLocale();
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 px-3 pt-3 sm:px-4 md:pl-1 md:pr-3">
      <header className="glass-bar flex h-14 shrink-0 items-center gap-3 rounded-[20px] px-3 md:px-4">
        <button
          type="button"
          className={cn(iconButtonClass, "md:hidden")}
          onClick={onOpenMobileNav}
          aria-label={t("Mở menu")}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="sm:hidden" aria-label={t("Bamboo — Trang chủ")}>
          <BambooLogo className="h-7 w-7" />
        </Link>
        <SiderToggle collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
        <Breadcrumb />

        <div className="flex min-w-0 flex-1 justify-center px-2">
          <SearchTrigger />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <OnlinePeople />
          <CompanySwitcher />
          <button
            type="button"
            className={cn(pillButtonClass, "max-sm:hidden")}
            onClick={() => navigate("/i/assistant")}
          >
            <Sparkles className="h-4 w-4 text-bamboo-600" strokeWidth={1.75} aria-hidden />
            {t("Trợ lý")}
          </button>
          <LanguageSwitch />
          <ColorModeToggle />
          <AppLauncher />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
    </div>
  );
};
