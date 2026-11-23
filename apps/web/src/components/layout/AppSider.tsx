/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { useList } from "@refinedev/core";
import { Tooltip } from "antd";
import gql from "graphql-tag";
import { Globe, Puzzle } from "lucide-react";
import { Link, useLocation } from "react-router";

import { tr, useLocale } from "../../i18n";
import { useModules } from "../../modules/useModules";
import { useUnreadTotal } from "../../pages/chat/useUnreadTotal";
import { cn } from "../../utils/cn";
import { BambooLogo } from "./BambooLogo";
import { findActive, NAV_GROUPS, type NavGroup, type NavItem } from "./nav";
import { NavGate } from "./NavGate";

type SiderProps = { collapsed?: boolean; onNavigate?: () => void };

const INBOX_COUNT = gql`
  query InboxCount($limit: Int, $offset: Int, $order_by: [wf_v_inbox_order_by!], $where: wf_v_inbox_bool_exp) {
    wf_v_inbox(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      task_id
    }
    wf_v_inbox_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

const useInboxCount = () => {
  const { result } = useList({
    resource: "wf_v_inbox",
    pagination: { pageSize: 1 },
    meta: { gqlQuery: INBOX_COUNT },
    liveMode: "auto",
  });
  return result.total ?? 0;
};

const SiderItem = ({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean } & SiderProps) => {
  const Icon = item.icon;
  const { t } = useLocale();
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? t(item.label) : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-xl text-[13.5px]",
        "transition-[background-color,box-shadow,color,transform]! duration-300! ease-[cubic-bezier(0.22,1,0.36,1)]!",
        "motion-safe:active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-400",
        "hover:bg-bamboo-600! hover:text-white!",
        active
          ? "bg-[linear-gradient(180deg,#3e8a4f_0%,#2f7a3e_55%,#1f5e2e_100%)] font-semibold text-white! shadow-glass-active"
          : "text-body!",
        collapsed ? "justify-center" : "px-2.5",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          active ? "text-white" : "text-muted group-hover:text-white",
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>}
      {!collapsed && item.badge ? (
        <span
          className={cn(
            "min-w-5 rounded-ui px-1.5 text-center text-[11.5px] font-medium tabular-nums transition-colors duration-300",
            active
              ? "bg-white/25 text-white"
              : "bg-surface/80 text-muted group-hover:bg-white/25 group-hover:text-white",
          )}
        >
          {item.badge}
        </span>
      ) : null}
      {collapsed && item.badge ? (
        <span
          className={cn(
            "absolute right-2 top-1.5 h-1.5 w-1.5 rounded-ui",
            active ? "bg-white" : "bg-bamboo-600 group-hover:bg-white",
          )}
          aria-hidden
        />
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip title={t(item.label)} placement="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
};

export const SiderContent = ({ collapsed = false, onNavigate }: SiderProps) => {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const activeKey = findActive(pathname)?.key;
  const inboxCount = useInboxCount();
  const unread = useUnreadTotal();
  const badgeOf = (item: NavItem) =>
    item.key === "inbox" ? inboxCount : item.key === "chat" ? unread || undefined : item.badge;
  const { enabled, overview } = useModules();
  const external: NavGroup = {
    code: "E",
    label: tr("Mở rộng"),
    items: (overview?.modules ?? [])
      .filter((m) => m.external && m.enabled)
      .flatMap((m) =>
        m.menu.map((item) => ({
          key: `${m.code}:${item.path}`,
          label: item.label,
          to: `/x/${m.code}${item.path === "/" ? "" : item.path}`,
          icon: Puzzle,
          module: m.code,
        })),
      ),
  };
  const externalActive = external.items
    .filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]?.key;
  const groups = [...NAV_GROUPS, external]
    .map((g) => ({ ...g, items: g.items.filter((i) => enabled(i.module)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className={cn("flex h-16 shrink-0 items-center gap-2.5", collapsed ? "justify-center" : "px-5")}
        aria-label={t("Bamboo — Trang chủ")}
      >
        <BambooLogo className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-[0.14em] text-ink">BAMBOO</span>
          </span>
        )}
      </Link>

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]"
        aria-label={t("Điều hướng chính")}
      >
        {groups.map((group) => (
          <NavGate key={group.code} access={group.access}>
            <div className="mt-3 first:mt-1 [&:first-child>[role=separator]]:hidden">
              <div role="separator" className={cn("mb-3 h-px bg-line", collapsed ? "mx-2" : "mx-2.5")} />
              <ul className="m-0 list-none flex flex-col gap-0.5 p-0" aria-label={t(group.label)}>
                {group.items.map((item) => (
                  <NavGate key={item.key} access={item.access}>
                    <li>
                      <SiderItem
                        item={{ ...item, badge: badgeOf(item) }}
                        active={item.key === (externalActive ?? activeKey)}
                        collapsed={collapsed}
                        onNavigate={onNavigate}
                      />
                    </li>
                  </NavGate>
                ))}
              </ul>
            </div>
          </NavGate>
        ))}
      </nav>

      <div className={cn("shrink-0 flex flex-col gap-2 border-t border-line/70 py-3", collapsed ? "px-2" : "px-3")}>
        <a
          href="#design-system"
          className={cn(
            "group flex h-8 items-center gap-3 rounded-xl text-[13px] text-body! hover:bg-bamboo-600! hover:text-white!",
            "transition-[background-color,color]! duration-300! ease-[cubic-bezier(0.22,1,0.36,1)]!",
            collapsed ? "justify-center" : "px-2.5",
          )}
          title="Bamboo Design System"
        >
          <Globe
            className="h-[17px] w-[17px] shrink-0 text-muted group-hover:text-white"
            strokeWidth={1.75}
            aria-hidden
          />
          {!collapsed && <span>Bamboo Design System</span>}
        </a>
        <div
          className={cn("flex items-center gap-2 text-[11.5px] text-muted", collapsed ? "justify-center" : "px-2.5")}
          title={t("Kết nối trực tiếp · Phiên đã xác thực MFA")}
        >
          <span className="h-2 w-2 shrink-0 rounded-ui bg-bamboo-500 shadow-[0_0_0_3px_rgb(63_145_80/0.15)]" />
          {!collapsed && <span>{t("Trực tiếp · Phiên MFA ✓")}</span>}
        </div>
      </div>
    </div>
  );
};

export const AppSider = ({ collapsed = false }: { collapsed?: boolean }) => (
  <div className={cn("sticky top-0 hidden h-screen shrink-0 p-3 pr-4 md:block", collapsed ? "w-[92px]" : "w-[264px]")}>
    <aside
      className={cn("glass-bar h-full overflow-hidden rounded-[24px]", "transition-[width] duration-200 ease-out")}
    >
      <SiderContent collapsed={collapsed} />
    </aside>
  </div>
);
