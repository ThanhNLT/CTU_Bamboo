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

import { CalendarDays, House, Inbox, Menu, MessagesSquare, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";

import { useUnreadTotal } from "../../pages/chat/useUnreadTotal";
import { notifyDevice } from "../../pwa";
import { tr, trf, useLocale } from "../../i18n";
import { cn } from "../../utils/cn";

type Tab = { to: string; label: string; icon: LucideIcon; badge?: number };

export const MobileTabBar = ({ onMore }: { onMore: () => void }) => {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const unread = useUnreadTotal();
  const previous = useRef(unread);

  useEffect(() => {
    if (unread > previous.current) {
      void notifyDevice(tr("Bamboo – tin nhắn mới"), trf("Bạn có {0} tin nhắn chưa đọc", [unread]), "/h/chat", "chat");
    }
    previous.current = unread;
  }, [unread]);

  const tabs: Tab[] = [
    { to: "/", label: t("Trang chủ"), icon: House },
    { to: "/p/tasks", label: t("Hộp việc"), icon: Inbox },
    { to: "/h/chat", label: t("Tin nhắn"), icon: MessagesSquare, badge: unread },
    { to: "/h/calendar", label: t("Lịch"), icon: CalendarDays },
  ];
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));

  return (
    <nav
      aria-label={t("Điều hướng nhanh")}
      className="glass-bar fixed inset-x-2 bottom-2 z-30 flex h-16 items-stretch rounded-[22px] px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ height: "calc(4rem + env(safe-area-inset-bottom))" }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const on = active(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] font-medium",
              on ? "text-bamboo-700!" : "text-muted!",
            )}
          >
            <span className={cn("grid h-7 w-12 place-items-center rounded-full", on && "bg-bamboo-50")}>
              <Icon className="h-[20px] w-[20px]" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
            </span>
            {tab.label}
            {!!tab.badge && (
              <span className="absolute right-[calc(50%-22px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-muted"
      >
        <span className="grid h-7 w-12 place-items-center rounded-full">
          <Menu className="h-[20px] w-[20px]" strokeWidth={1.8} aria-hidden />
        </span>
        {t("Thêm")}
      </button>
    </nav>
  );
};
