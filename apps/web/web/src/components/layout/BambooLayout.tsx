// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { RefineKbar } from "@refinedev/kbar";
import { Drawer } from "antd";
import { useEffect, useState, type PropsWithChildren } from "react";
import { useLocation } from "react-router";

import { AppHeader } from "./AppHeader";
import { AppSider, SiderContent } from "./AppSider";

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
    <div className="flex min-h-screen bg-[radial-gradient(1200px_600px_at_0%_0%,var(--color-bamboo-100)_0%,transparent_60%),radial-gradient(900px_500px_at_100%_100%,var(--color-bamboo-100)_0%,transparent_55%),linear-gradient(135deg,var(--color-bamboo-50)_0%,var(--color-canvas)_45%,var(--color-canvas)_100%)] font-sans text-ink">
      <AppSider collapsed={collapsed} />

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        width={272}
        closable={false}
        styles={{
          body: { padding: 0, background: "transparent" },
          content: { background: "var(--glass-bg)", backdropFilter: "blur(30px) saturate(180%)" },
        }}
      >
        <SiderContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader collapsed={collapsed} onCollapsedChange={setCollapsed} onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>

      <RefineKbar />
    </div>
  );
};
