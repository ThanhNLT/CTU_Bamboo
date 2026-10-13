// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Phiên làm việc: tenant đang chọn và người dùng trong tenant đó (ADR #30). Sau khi đăng nhập,
// gọi my_tenants (role `account`, chưa gửi tenant); một tenant thì chọn luôn, nhiều tenant thì hỏi.

// ===== Thư viện =====
import { useCallback, useEffect, useState, type ReactNode } from "react"; // React
import { Alert, Button, Card, Flex, List, Spin, Typography } from "antd"; // Ant Design
import { BankOutlined, MedicineBoxOutlined } from "@ant-design/icons"; // Ant Design Icons

// ===== Module nội bộ =====
import { getTenant, request, setTenant } from "../api/client";
import { SessionContext, type AccountTenant } from "./useSession";

// ===== Truy vấn GraphQL =====
const MY_TENANTS = `query MyTenants { my_tenants { tenant_id tenant_code tenant_name person_id full_name } }`;

// ===== Component =====
export const TenantGate = ({ children }: { children: ReactNode }) => {
  const [tenants, setTenants] = useState<AccountTenant[] | null>(null);
  const [selected, setSelected] = useState<string | null>(getTenant());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<{ my_tenants: AccountTenant[] }>(MY_TENANTS, undefined, { withTenant: false })
      .then(({ my_tenants }) => {
        setTenants(my_tenants);
        const stored = my_tenants.find((t) => t.tenant_id === getTenant());
        if (stored) return;
        const only = my_tenants.length === 1 ? my_tenants[0].tenant_id : null;
        setTenant(only);
        setSelected(only);
      })
      .catch((e) => setError(e.message));
  }, []);

  const switchTenant = useCallback((tenantId: string) => {
    setTenant(tenantId);
    setSelected(tenantId);
    // Mọi dữ liệu đang hiển thị thuộc tenant cũ: tải lại trang cho sạch bộ nhớ đệm.
    window.location.assign("/");
  }, []);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        style={{ margin: 48 }}
        message="Không lấy được danh sách tenant"
        description={error}
      />
    );
  }
  if (!tenants) {
    return <Spin fullscreen tip="Đang tải phiên làm việc..." />;
  }
  if (tenants.length === 0) {
    return (
      <Alert
        type="warning"
        showIcon
        style={{ margin: 48 }}
        message="Tài khoản chưa thuộc tenant nào"
        description="Liên hệ quản trị để được bổ nhiệm vào một đơn vị."
      />
    );
  }
  const tenant = tenants.find((t) => t.tenant_id === selected);
  if (!tenant) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
        <Card title="Chọn đơn vị làm việc" style={{ width: 420 }}>
          <Typography.Paragraph type="secondary">
            Tài khoản của bạn làm việc ở nhiều tenant. Mỗi phiên chỉ thấy dữ liệu của một tenant.
          </Typography.Paragraph>
          <List
            dataSource={tenants}
            renderItem={(t) => (
              <List.Item>
                <Button
                  block
                  size="large"
                  icon={t.tenant_code === "BVX" ? <MedicineBoxOutlined /> : <BankOutlined />}
                  onClick={() => {
                    setTenant(t.tenant_id);
                    setSelected(t.tenant_id);
                  }}
                >
                  {t.tenant_name} — {t.full_name}
                </Button>
              </List.Item>
            )}
          />
        </Card>
      </Flex>
    );
  }
  return <SessionContext.Provider value={{ tenant, tenants, switchTenant }}>{children}</SessionContext.Provider>;
};
