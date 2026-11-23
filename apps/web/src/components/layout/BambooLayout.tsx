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

import { Drawer } from "antd";
import { useEffect, useState, type PropsWithChildren } from "react";
import { useLocation } from "react-router";

import { AppHeader } from "./AppHeader";
import { AppSider, SiderContent } from "./AppSider";
import { CommandBar } from "./CommandBar";
import { MobileTabBar } from "./MobileTabBar";

const COLLAPSED_KEY = "bamboo.sider.collapsed";

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

export const BambooLayout = ({ children }: PropsWithChildren) => {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="app-canvas flex min-h-screen font-sans text-ink">
      <AppSider collapsed={collapsed} />

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        width={272}
        closable={false}
        styles={{
          body: { padding: 0, background: "transparent" },
          content: { background: "var(--glass-strong)", backdropFilter: "var(--glass-blur)" },
        }}
      >
        <SiderContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader collapsed={collapsed} onCollapsedChange={setCollapsed} onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 md:pb-6 md:pl-1 md:pr-3 md:pt-5">
          {children}
        </main>
      </div>

      <MobileTabBar onMore={() => setMobileOpen(true)} />
      <CommandBar />
    </div>
  );
};
