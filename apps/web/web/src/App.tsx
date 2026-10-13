// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Authenticated, Refine } from "@refinedev/core"; // Refine
import { RefineKbarProvider } from "@refinedev/kbar"; // Refine Kbar
import { ErrorComponent, useNotificationProvider } from "@refinedev/antd"; // Refine Ant Design
import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router"; // Refine React Router
import { App as AntdApp, ConfigProvider, Spin } from "antd"; // Ant Design
import viVN from "antd/locale/vi_VN"; // Ant Design
import {
  AuditOutlined,
  FileTextOutlined,
  InboxOutlined,
  SearchOutlined,
  SwapOutlined,
  UserAddOutlined,
} from "@ant-design/icons"; // Ant Design Icons
import dayjs from "dayjs"; // Day.js
import "dayjs/locale/vi"; // Day.js
import { lazy, Suspense } from "react"; // React
import { BrowserRouter, Outlet, Route, Routes } from "react-router"; // React Router
import { useKeycloak } from "@react-keycloak/web"; // React Keycloak

// ===== Module nội bộ =====
// Reset của AntD được nạp trong tailwind.css (layer base) để không đè class Tailwind.
import "./styles/tailwind.css";
import { TenantGate } from "./auth/session";
import { BambooLayout } from "./components/layout";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { AuditLogList } from "./pages/audit/list";
import { CatalogPage, OrgPage, PeoplePage, RolesPage } from "./pages/admin";
import { DashboardPage } from "./pages/dashboard";
import { DocumentDrivePage } from "./pages/document-drive";
import { KnowledgeLibraryPage } from "./pages/knowledge-library";
import { DataServicesPage } from "./pages/data-services";
import { DigitalTwinPage } from "./pages/digital-twin";
import { DataLineagePage } from "./pages/data-lineage";
import { LedgerPage } from "./pages/ledger";
import { AiAssistantPage } from "./pages/ai-assistant";
import { OcrInputPage } from "./pages/ocr-input";
import { AiAgentsPage } from "./pages/ai-agents";
import { MapPage } from "./pages/map";
import { OperationsCenterPage } from "./pages/operations-center";
import { ProcessDesignPage } from "./pages/process-design";
import { RecordsPage } from "./pages/records";
import { IcOrderList, IcOrderShow } from "./pages/ic-orders";
import { InboxPage } from "./pages/inbox";
import { InboxList } from "./pages/inbox/list";
import { Login } from "./pages/login";
import { OnboardingCreate, OnboardingEdit, OnboardingList, OnboardingShow } from "./pages/onboarding";
import {
  PurchaseRequestCreate,
  PurchaseRequestEdit,
  PurchaseRequestList,
  PurchaseRequestShow,
} from "./pages/purchase-requests";
import { SearchPage } from "./pages/search";
import { accessControlProvider } from "./providers/access";
import { authProvider } from "./providers/auth";
import { dataProvider, liveProvider } from "./providers/data";
import { i18nProvider } from "./providers/i18n";

// ===== Khởi tạo =====
dayjs.locale("vi");

// ===== Trang tải lười =====
// bpmn-js nặng: chỉ tải khi mở sơ đồ quy trình.
const ProcessDiagram = lazy(() => import("./pages/process/diagram"));

// ===== Component =====
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
                  { name: "dashboard", list: "/", meta: { label: "Trang chủ" } },
                  { name: "drive", list: "/h/drive", meta: { label: "Ổ đĩa tài liệu" } },
                  { name: "library", list: "/h/library", meta: { label: "Thư viện tri thức" } },
                  { name: "records", list: "/p/records", meta: { label: "Hồ sơ" } },
                  { name: "tasks", list: "/p/tasks", meta: { label: "Hộp việc" } },
                  { name: "process_design", list: "/p/process", meta: { label: "Thiết kế quy trình" } },
                  { name: "operations", list: "/d/ops", meta: { label: "Trung tâm điều hành" } },
                  { name: "map", list: "/d/map", meta: { label: "Bản đồ" } },
                  { name: "data_services", list: "/d/services", meta: { label: "Dịch vụ dữ liệu" } },
                  { name: "digital_twin", list: "/d/twin", meta: { label: "Bản sao số" } },
                  { name: "data_lineage", list: "/d/lineage", meta: { label: "Phả hệ dữ liệu" } },
                  { name: "ledger", list: "/d/ledger", meta: { label: "Sổ cái" } },
                  { name: "assistant", list: "/i/assistant", meta: { label: "Trợ lý đa năng" } },
                  { name: "ocr", list: "/i/ocr", meta: { label: "Nhập liệu OCR" } },
                  { name: "agents", list: "/i/agents", meta: { label: "Tác tử AI" } },
                  {
                    name: "proc_purchase_request",
                    list: "/p/documents",
                    create: "/p/documents/create",
                    edit: "/p/documents/edit/:id",
                    show: "/p/documents/show/:id",
                    meta: { label: "Đề nghị mua sắm", icon: <FileTextOutlined /> },
                  },
                  {
                    name: "ic_ic_order",
                    list: "/p/ic-orders",
                    show: "/p/ic-orders/show/:id",
                    meta: { label: "Đơn hàng nội bộ", icon: <SwapOutlined /> },
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
                  {
                    name: "audit_log",
                    list: "/admin/audit-logs",
                    meta: { label: "Kiểm toán", icon: <AuditOutlined /> },
                  },
                  { name: "admin_org", list: "/admin/org", meta: { label: "Cơ cấu tổ chức" } },
                  { name: "admin_people", list: "/admin/people", meta: { label: "Người dùng" } },
                  { name: "admin_roles", list: "/admin/roles", meta: { label: "Vai trò & phân quyền" } },
                  { name: "admin_catalog", list: "/admin/catalog", meta: { label: "Danh mục & dữ liệu chủ" } },
                  { name: "collab_notification", meta: { hide: true } },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  liveMode: "auto",
                  disableTelemetry: true,
                }}
              >
                <Routes>
                  <Route
                    element={
                      <Authenticated key="authenticated-inner" fallback={<CatchAllNavigate to="/login" />}>
                        <TenantGate>
                          <BambooLayout>
                            <Outlet />
                          </BambooLayout>
                        </TenantGate>
                      </Authenticated>
                    }
                  >
                    <Route index element={<DashboardPage />} />
                    <Route path="/h/drive" element={<DocumentDrivePage />} />
                    <Route path="/h/library" element={<KnowledgeLibraryPage />} />
                    <Route path="/p/records" element={<RecordsPage />} />
                    <Route path="/p/tasks" element={<InboxPage />} />
                    <Route path="/p/process" element={<ProcessDesignPage />} />
                    <Route path="/d/ops" element={<OperationsCenterPage />} />
                    <Route path="/d/map" element={<MapPage />} />
                    <Route path="/d/services" element={<DataServicesPage />} />
                    <Route path="/d/twin" element={<DigitalTwinPage />} />
                    <Route path="/d/lineage" element={<DataLineagePage />} />
                    <Route path="/d/ledger" element={<LedgerPage />} />
                    <Route path="/i/assistant" element={<AiAssistantPage />} />
                    <Route path="/i/ocr" element={<OcrInputPage />} />
                    <Route path="/i/agents" element={<AiAgentsPage />} />
                    <Route path="/p/documents">
                      <Route index element={<PurchaseRequestList />} />
                      <Route path="create" element={<PurchaseRequestCreate />} />
                      <Route path="edit/:id" element={<PurchaseRequestEdit />} />
                      <Route path="show/:id" element={<PurchaseRequestShow />} />
                    </Route>
                    <Route path="/p/ic-orders">
                      <Route index element={<IcOrderList />} />
                      <Route path="show/:id" element={<IcOrderShow />} />
                    </Route>
                    <Route path="/h/onboarding">
                      <Route index element={<OnboardingList />} />
                      <Route path="create" element={<OnboardingCreate />} />
                      <Route path="edit/:id" element={<OnboardingEdit />} />
                      <Route path="show/:id" element={<OnboardingShow />} />
                    </Route>
                    <Route path="/p/inbox" element={<InboxList />} />
                    <Route
                      path="/p/process/:id"
                      element={
                        <Suspense fallback={<Spin />}>
                          <ProcessDiagram />
                        </Suspense>
                      }
                    />
                    <Route path="/i/search" element={<SearchPage />} />
                    <Route path="/admin/audit-logs" element={<AuditLogList />} />
                    <Route path="/admin/org" element={<OrgPage />} />
                    <Route path="/admin/people" element={<PeoplePage />} />
                    <Route path="/admin/roles" element={<RolesPage />} />
                    <Route path="/admin/catalog" element={<CatalogPage />} />
                    <Route path="*" element={<ErrorComponent />} />
                  </Route>
                  <Route
                    element={
                      <Authenticated key="authenticated-outer" fallback={<Outlet />}>
                        <NavigateToResource />
                      </Authenticated>
                    }
                  >
                    <Route path="/login" element={<Login />} />
                  </Route>
                </Routes>
                <UnsavedChangesNotifier />
                <DocumentTitleHandler
                  handler={({ resource }) => `${resource?.meta?.label ?? "Bamboo"} | Bamboo DX-OS`}
                />
              </Refine>
            </AntdApp>
          </ConfigProvider>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
