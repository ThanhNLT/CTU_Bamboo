// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useLogout } from "@refinedev/core";
import { Avatar, Dropdown, Layout as AntdLayout, Space, Switch, Tag, theme, Typography } from "antd";
import { LogoutOutlined, SwapOutlined, UserOutlined } from "@ant-design/icons";
import React, { useContext } from "react";
import { useSession } from "../../auth/session";
import { ColorModeContext } from "../../contexts/color-mode";
import { NotificationBell } from "../notifications/Bell";

export const Header: React.FC<RefineThemedLayoutHeaderProps> = ({ sticky = true }) => {
  const { token } = theme.useToken();
  const { mode, setMode } = useContext(ColorModeContext);
  const { tenant, tenants, switchTenant } = useSession();
  const { mutate: logout } = useLogout();

  const style: React.CSSProperties = {
    backgroundColor: token.colorBgElevated, display: "flex", justifyContent: "space-between",
    alignItems: "center", padding: "0 24px", height: 64,
    ...(sticky ? { position: "sticky", top: 0, zIndex: 1 } : {}),
  };

  const menu = {
    items: [
      ...tenants.filter((t) => t.tenant_id !== tenant.tenant_id).map((t) => ({
        key: t.tenant_id, icon: <SwapOutlined />, label: `Chuyển sang ${t.tenant_name}`, onClick: () => switchTenant(t.tenant_id),
      })),
      { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => logout() },
    ],
  };

  return (
    <AntdLayout.Header style={style}>
      {/* Tenant hiện tại luôn hiển thị (UI-04). */}
      <Tag color="geekblue" style={{ fontSize: 14, padding: "4px 10px" }}>{tenant.tenant_name}</Tag>
      <Space size="middle">
        <NotificationBell />
        <Switch checkedChildren="🌛" unCheckedChildren="🔆" aria-label="Chế độ tối"
                onChange={() => setMode(mode === "light" ? "dark" : "light")} defaultChecked={mode === "dark"} />
        <Dropdown menu={menu} trigger={["click"]}>
          <Space style={{ cursor: "pointer" }}>
            <Avatar icon={<UserOutlined />} />
            <Typography.Text strong>{tenant.full_name}</Typography.Text>
          </Space>
        </Dropdown>
      </Space>
    </AntdLayout.Header>
  );
};
