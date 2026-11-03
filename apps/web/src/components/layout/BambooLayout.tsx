// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Drawer } from "antd";
import { useEffect, useState, type PropsWithChildren } from "react";
import { useLocation } from "react-router";

import { AppHeader } from "./AppHeader";
import { AppSider, SiderContent } from "./AppSider";
import { CommandBar } from "./CommandBar";

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
        <main className="min-w-0 flex-1 px-3 pb-6 pt-4 sm:px-4 md:pl-1 md:pr-3 md:pt-5">{children}</main>
      </div>

      <CommandBar />
    </div>
  );
};
