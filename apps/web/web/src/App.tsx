// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Authenticated, Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { ErrorComponent, ThemedLayout, ThemedSider, ThemedTitle, useNotificationProvider } from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";
import routerProvider, {
  CatchAllNavigate, DocumentTitleHandler, NavigateToResource, UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { App as AntdApp, ConfigProvider, Spin } from "antd";
import viVN from "antd/locale/vi_VN";
import { AuditOutlined, FileTextOutlined, InboxOutlined, SearchOutlined, UserAddOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { lazy, Suspense } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import { useKeycloak } from "@react-keycloak/web";
import { TenantGate } from "./auth/session";
import { Header } from "./components/header";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { AuditLogList } from "./pages/audit/list";
import { InboxList } from "./pages/inbox/list";
import { Login } from "./pages/login";
import { OnboardingCreate, OnboardingEdit, OnboardingList, OnboardingShow } from "./pages/onboarding";
import {
  PurchaseRequestCreate, PurchaseRequestEdit, PurchaseRequestList, PurchaseRequestShow,
} from "./pages/purchase-requests";
import { SearchPage } from "./pages/search";
import { accessControlProvider } from "./providers/access";
import { authProvider } from "./providers/auth";
import { dataProvider, liveProvider } from "./providers/data";
import { i18nProvider } from "./providers/i18n";

dayjs.locale("vi");

// bpmn-js nặng: chỉ tải khi mở sơ đồ quy trình.
const ProcessDiagram = lazy(() => import("./pages/process/diagram"));

const Title = ({ collapsed }: { collapsed: boolean }) => <ThemedTitle collapsed={collapsed} text="Bamboo DX-OS" />;

function App() {
  const { initialized } = useKeycloak();
  if (!initialized) return <div style={{ padding: 48 }}>Đang kết nối máy chủ đăng nhập...</div>;

  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <ConfigProvider locale={viVN}>
            <AntdApp>
              <Refine
                dataProvider={dataProvider}
                liveProvider={liveProvider}
                authProvider={authProvider}
                accessControlProvider={accessControlProvider}
                i18nProvider={i18nProvider}
                notificationProvider={useNotificationProvider}
                routerProvider={routerProvider}
                resources={[
                  {
                    name: "proc_purchase_request",
                    list: "/p/documents",
                    create: "/p/documents/create",
                    edit: "/p/documents/edit/:id",
                    show: "/p/documents/show/:id",
                    meta: { label: "Đề nghị mua sắm", icon: <FileTextOutlined /> },
                  },
                  {
                    name: "hr_onboarding_request",
                    list: "/h/onboarding",
                    create: "/h/onboarding/create",
                    edit: "/h/onboarding/edit/:id",
                    show: "/h/onboarding/show/:id",
                    meta: { label: "Tiếp nhận nhân sự", icon: <UserAddOutlined /> },
                  },
                  { name: "wf_v_inbox", list: "/p/inbox", meta: { label: "Hộp việc duyệt", icon: <InboxOutlined /> } },
                  { name: "search", list: "/i/search", meta: { label: "Tìm kiếm", icon: <SearchOutlined /> } },
                  { name: "audit_log", list: "/admin/audit-logs", meta: { label: "Kiểm toán", icon: <AuditOutlined /> } },
                  { name: "collab_notification", meta: { hide: true } },
                ]}
                options={{ syncWithLocation: true, warnWhenUnsavedChanges: true, liveMode: "auto", disableTelemetry: true }}
              >
                <Routes>
                  <Route
                    element={
                      <Authenticated key="authenticated-inner" fallback={<CatchAllNavigate to="/login" />}>
                        <TenantGate>
                          <ThemedLayout Header={Header} Title={Title} Sider={(props) => <ThemedSider {...props} fixed />}>
                            <Outlet />
                          </ThemedLayout>
                        </TenantGate>
                      </Authenticated>
                    }
                  >
                    <Route index element={<NavigateToResource resource="proc_purchase_request" />} />
                    <Route path="/p/documents">
                      <Route index element={<PurchaseRequestList />} />
                      <Route path="create" element={<PurchaseRequestCreate />} />
                      <Route path="edit/:id" element={<PurchaseRequestEdit />} />
                      <Route path="show/:id" element={<PurchaseRequestShow />} />
                    </Route>
                    <Route path="/h/onboarding">
                      <Route index element={<OnboardingList />} />
                      <Route path="create" element={<OnboardingCreate />} />
                      <Route path="edit/:id" element={<OnboardingEdit />} />
                      <Route path="show/:id" element={<OnboardingShow />} />
                    </Route>
                    <Route path="/p/inbox" element={<InboxList />} />
                    <Route path="/p/process/:id" element={<Suspense fallback={<Spin />}><ProcessDiagram /></Suspense>} />
                    <Route path="/i/search" element={<SearchPage />} />
                    <Route path="/admin/audit-logs" element={<AuditLogList />} />
                    <Route path="*" element={<ErrorComponent />} />
                  </Route>
                  <Route element={<Authenticated key="authenticated-outer" fallback={<Outlet />}><NavigateToResource /></Authenticated>}>
                    <Route path="/login" element={<Login />} />
                  </Route>
                </Routes>
                <RefineKbar />
                <UnsavedChangesNotifier />
                <DocumentTitleHandler handler={({ resource }) => `${resource?.meta?.label ?? "Bamboo"} | Bamboo DX-OS`} />
              </Refine>
            </AntdApp>
          </ConfigProvider>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
