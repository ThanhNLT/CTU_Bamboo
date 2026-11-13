/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Card, Flex, List, Spin, Typography } from "antd";
import { BankOutlined, MedicineBoxOutlined } from "@ant-design/icons";

import { getTenant, request, setTenant } from "../api/client";
import { SessionContext, type AccountTenant } from "./useSession";
import { getLocale, tr } from "../i18n";

const RETRIES = 20;
const MY_TENANTS = `query MyTenants { my_tenants { tenant_id tenant_code tenant_name person_id full_name } }`;

export const TenantGate = ({ children }: { children: ReactNode }) => {
  const [tenants, setTenants] = useState<AccountTenant[] | null>(null);
  const [selected, setSelected] = useState<string | null>(getTenant());
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!selected || !tenants?.some((t) => t.tenant_id === selected)) return;
    void request(`mutation SetMyLocale($l: String!) { set_my_locale(locale: $l) { locale } }`, {
      l: getLocale(),
    }).catch(() => undefined);
  }, [selected, tenants]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    request<{ my_tenants: AccountTenant[] }>(MY_TENANTS, undefined, { withTenant: false })
      .then(({ my_tenants }) => {
        if (!alive) return;
        setError(null);
        setTenants(my_tenants);
        const stored = my_tenants.find((t) => t.tenant_id === getTenant());
        if (stored) return;
        const only = my_tenants.length === 1 ? my_tenants[0].tenant_id : null;
        setTenant(only);
        setSelected(only);
      })
      .catch((e: { message: string; statusCode?: number }) => {
        if (!alive) return;
        if ((e.statusCode ?? 0) >= 500 && attempt < RETRIES) timer = setTimeout(() => setAttempt((n) => n + 1), 3000);
        else setError(e.message);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  const switchTenant = useCallback((tenantId: string) => {
    setTenant(tenantId);
    setSelected(tenantId);
    window.location.assign("/");
  }, []);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        style={{ margin: 48 }}
        message={tr("Không lấy được danh sách tenant")}
        description={error}
        action={<Button onClick={() => window.location.reload()}>{tr("Thử lại")}</Button>}
      />
    );
  }
  if (!tenants) {
    return <Spin fullscreen tip={tr("Đang tải phiên làm việc...")} />;
  }
  if (tenants.length === 0) {
    return (
      <Alert
        type="warning"
        showIcon
        style={{ margin: 48 }}
        message={tr("Tài khoản chưa thuộc tenant nào")}
        description={tr("Liên hệ quản trị để được bổ nhiệm vào một đơn vị.")}
      />
    );
  }
  const tenant = tenants.find((t) => t.tenant_id === selected);
  if (!tenant) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
        <Card title={tr("Chọn đơn vị làm việc")} style={{ width: 420 }}>
          <Typography.Paragraph type="secondary">
            {tr("Tài khoản của bạn làm việc ở nhiều tenant. Mỗi phiên chỉ thấy dữ liệu của một tenant.")}
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
