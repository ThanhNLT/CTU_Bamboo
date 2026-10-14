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
    <div className="flex min-h-screen bg-[linear-gradient(135deg,#f4f8f4_0%,#f6f7f6_40%,#eef5ef_100%)] font-sans text-ink">
      <AppSider collapsed={collapsed} />

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        width={272}
        closable={false}
        styles={{ body: { padding: 0, background: "linear-gradient(180deg,#eaf5ec 0%,#f2f8f3 100%)" } }}
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
