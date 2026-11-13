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

import { lazy, Suspense, type ComponentType } from "react";
import { Authenticated, Refine } from "@refinedev/core";
import { RefineKbarProvider } from "@refinedev/kbar";
import { ErrorComponent, useNotificationProvider } from "@refinedev/antd";
import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { App as AntdApp, ConfigProvider, Spin } from "antd";
import enUS from "antd/locale/en_US";
import viVN from "antd/locale/vi_VN";
import {
  AuditOutlined,
  FileTextOutlined,
  InboxOutlined,
  SearchOutlined,
  SwapOutlined,
  SolutionOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import updateLocale from "dayjs/plugin/updateLocale";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { useKeycloak } from "@react-keycloak/web";

import "./styles/tailwind.css";
import { TenantGate } from "./auth/session";
import { BambooLayout } from "./components/layout";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { DashboardPage } from "./pages/dashboard";
import { Login } from "./pages/login";
import { ModulesProvider } from "./modules/context";
import { RequireModule } from "./modules/RequireModule";
import { accessControlProvider } from "./providers/access";
import { authProvider } from "./providers/auth";
import { dataProvider, liveProvider } from "./providers/data";
import { getLocale, tr } from "./i18n";
import { i18nProvider } from "./providers/i18n";

const LOCALE = getLocale();
dayjs.extend(updateLocale);
dayjs.updateLocale("vi", { monthsShort: "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_") });
dayjs.locale(LOCALE === "en" ? "en" : "vi");

const BASE_LOCALE = LOCALE === "en" ? enUS : viVN;
const ANTD_LOCALE = {
  ...BASE_LOCALE,
  DatePicker: BASE_LOCALE.DatePicker && {
    ...BASE_LOCALE.DatePicker,
    lang: {
      ...BASE_LOCALE.DatePicker.lang,
      fieldDateFormat: "DD-MMM-YYYY",
      fieldDateTimeFormat: "DD-MMM-YYYY HH:mm:ss",
      dateFormat: "DD-MMM-YYYY",
      dateTimeFormat: "DD-MMM-YYYY HH:mm:ss",
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lazyNamed = <M extends Record<K, ComponentType<any>>, K extends string>(load: () => Promise<M>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const loadAuditList = () => import("./pages/audit/list");
const AuditLogList = lazyNamed(loadAuditList, "AuditLogList");
const loadAdmin = () => import("./pages/admin");
const CatalogPage = lazyNamed(loadAdmin, "CatalogPage");
const CompanyPage = lazyNamed(loadAdmin, "CompanyPage");
const ModulesPage = lazyNamed(loadAdmin, "ModulesPage");
const OrgPage = lazyNamed(loadAdmin, "OrgPage");
const PeoplePage = lazyNamed(loadAdmin, "PeoplePage");
const RolesPage = lazyNamed(loadAdmin, "RolesPage");
const loadDocumentDrive = () => import("./pages/document-drive");
const DocumentDrivePage = lazyNamed(loadDocumentDrive, "DocumentDrivePage");
const loadKnowledgeLibrary = () => import("./pages/knowledge-library");
const KnowledgeLibraryPage = lazyNamed(loadKnowledgeLibrary, "KnowledgeLibraryPage");
const ProposalPage = lazyNamed(loadKnowledgeLibrary, "ProposalPage");
const loadDataServices = () => import("./pages/data-services");
const DataServicesPage = lazyNamed(loadDataServices, "DataServicesPage");
const loadDigitalTwin = () => import("./pages/digital-twin");
const DigitalTwinPage = lazyNamed(loadDigitalTwin, "DigitalTwinPage");
const loadDataLineage = () => import("./pages/data-lineage");
const DataLineagePage = lazyNamed(loadDataLineage, "DataLineagePage");
const loadLedger = () => import("./pages/ledger");
const LedgerPage = lazyNamed(loadLedger, "LedgerPage");
const loadAiAssistant = () => import("./pages/ai-assistant");
const AiAssistantPage = lazyNamed(loadAiAssistant, "AiAssistantPage");
const loadAiAgents = () => import("./pages/ai-agents");
const AiAgentsPage = lazyNamed(loadAiAgents, "AiAgentsPage");
const loadBiAnalytics = () => import("./pages/bi-analytics");
const BiAnalyticsPage = lazyNamed(loadBiAnalytics, "BiAnalyticsPage");
const loadApiPortal = () => import("./pages/api-portal");
const ApiPortalPage = lazyNamed(loadApiPortal, "ApiPortalPage");
const loadChat = () => import("./pages/chat");
const ChatPage = lazyNamed(loadChat, "ChatPage");
const loadWorkCalendar = () => import("./pages/work-calendar");
const CalendarPage = lazyNamed(loadWorkCalendar, "CalendarPage");
const loadProjects = () => import("./pages/projects");
const ProjectListPage = lazyNamed(loadProjects, "ProjectListPage");
const ProjectPage = lazyNamed(loadProjects, "ProjectPage");
const loadOcrInput = () => import("./pages/ocr-input");
const OcrInputPage = lazyNamed(loadOcrInput, "OcrInputPage");
const loadOperationsCenter = () => import("./pages/operations-center");
const OperationsCenterPage = lazyNamed(loadOperationsCenter, "OperationsCenterPage");
const loadMessaging = () => import("./pages/messaging");
const NotificationSettingsPage = lazyNamed(loadMessaging, "NotificationSettingsPage");
const QueuePage = lazyNamed(loadMessaging, "QueuePage");
const loadOps = () => import("./pages/ops");
const OpsPage = lazyNamed(loadOps, "OpsPage");
const loadPersonnelDecision = () => import("./pages/personnel-decision");
const PersonnelDecisionPage = lazyNamed(loadPersonnelDecision, "PersonnelDecisionPage");
const loadProcessDesign = () => import("./pages/process-design");
const ProcessDesignPage = lazyNamed(loadProcessDesign, "ProcessDesignPage");
const loadRecords = () => import("./pages/records");
const RecordsPage = lazyNamed(loadRecords, "RecordsPage");
const loadIcOrders = () => import("./pages/ic-orders");
const IcOrderList = lazyNamed(loadIcOrders, "IcOrderList");
const IcOrderShow = lazyNamed(loadIcOrders, "IcOrderShow");
const loadInbox = () => import("./pages/inbox");
const InboxPage = lazyNamed(loadInbox, "InboxPage");
const loadInboxList = () => import("./pages/inbox/list");
const InboxList = lazyNamed(loadInboxList, "InboxList");
const loadOnboarding = () => import("./pages/onboarding");
const OnboardingCreate = lazyNamed(loadOnboarding, "OnboardingCreate");
const OnboardingEdit = lazyNamed(loadOnboarding, "OnboardingEdit");
const OnboardingList = lazyNamed(loadOnboarding, "OnboardingList");
const OnboardingShow = lazyNamed(loadOnboarding, "OnboardingShow");
const loadTransfer = () => import("./pages/transfer");
const CrossTransferList = lazyNamed(loadTransfer, "CrossTransferList");
const CrossTransferShow = lazyNamed(loadTransfer, "CrossTransferShow");
const TransferCreate = lazyNamed(loadTransfer, "TransferCreate");
const TransferLegShow = lazyNamed(loadTransfer, "TransferLegShow");
const TransferList = lazyNamed(loadTransfer, "TransferList");
const TransferShow = lazyNamed(loadTransfer, "TransferShow");
const loadPurchaseRequests = () => import("./pages/purchase-requests");
const PurchaseRequestCreate = lazyNamed(loadPurchaseRequests, "PurchaseRequestCreate");
const PurchaseRequestEdit = lazyNamed(loadPurchaseRequests, "PurchaseRequestEdit");
const PurchaseRequestList = lazyNamed(loadPurchaseRequests, "PurchaseRequestList");
const PurchaseRequestShow = lazyNamed(loadPurchaseRequests, "PurchaseRequestShow");
const loadSearch = () => import("./pages/search");
const SearchPage = lazyNamed(loadSearch, "SearchPage");
const loadExternal = () => import("./pages/external");
const ExternalModulePage = lazyNamed(loadExternal, "ExternalModulePage");
const loadSetup = () => import("./pages/setup");
const RecoveryPage = lazyNamed(loadSetup, "RecoveryPage");
const SetupPage = lazyNamed(loadSetup, "SetupPage");
const ProcessDiagram = lazy(() => import("./pages/process/diagram"));

function App() {
  const { initialized } = useKeycloak();
  if (!initialized) return <div style={{ padding: 48 }}>{tr("Đang kết nối máy chủ đăng nhập...")}</div>;

  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <ConfigProvider locale={ANTD_LOCALE}>
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
                  { name: "dashboard", list: "/", meta: { label: tr("Trang chủ") } },
                  { name: "drive", list: "/h/drive", meta: { label: tr("Ổ đĩa tài liệu") } },
                  { name: "library", list: "/h/library", meta: { label: tr("Thư viện tri thức") } },
                  { name: "records", list: "/p/records", meta: { label: tr("Hồ sơ") } },
                  { name: "tasks", list: "/p/tasks", meta: { label: tr("Hộp việc") } },
                  { name: "process_design", list: "/p/process", meta: { label: tr("Thiết kế quy trình") } },
                  { name: "operations", list: "/d/ops", meta: { label: tr("Trung tâm điều hành") } },
                  { name: "data_services", list: "/d/services", meta: { label: tr("Dịch vụ dữ liệu") } },
                  { name: "digital_twin", list: "/d/twin", meta: { label: tr("Bản sao số") } },
                  { name: "data_lineage", list: "/d/lineage", meta: { label: tr("Phả hệ dữ liệu") } },
                  { name: "ledger", list: "/d/ledger", meta: { label: tr("Sổ cái") } },
                  { name: "api_portal", list: "/d/api", meta: { label: tr("Cổng dịch vụ API") } },
                  { name: "assistant", list: "/i/assistant", meta: { label: tr("Trợ lý đa năng") } },
                  { name: "ocr", list: "/i/ocr", meta: { label: tr("Nhập liệu OCR") } },
                  { name: "agents", list: "/i/agents", meta: { label: tr("Tác tử AI") } },
                  { name: "bi", list: "/i/bi", meta: { label: tr("Phân tích BI") } },
                  {
                    name: "proc_purchase_request",
                    list: "/p/documents",
                    create: "/p/documents/create",
                    edit: "/p/documents/edit/:id",
                    show: "/p/documents/show/:id",
                    meta: { label: tr("Đề nghị mua sắm"), icon: <FileTextOutlined /> },
                  },
                  {
                    name: "ic_ic_order",
                    list: "/p/ic-orders",
                    show: "/p/ic-orders/show/:id",
                    meta: { label: tr("Đơn hàng nội bộ"), icon: <SwapOutlined /> },
                  },
                  {
                    name: "hr_onboarding_request",
                    list: "/h/onboarding",
                    create: "/h/onboarding/create",
                    edit: "/h/onboarding/edit/:id",
                    show: "/h/onboarding/show/:id",
                    meta: { label: tr("Tiếp nhận nhân sự"), icon: <UserAddOutlined /> },
                  },
                  {
                    name: "hr_transfer_request",
                    list: "/h/transfer",
                    create: "/h/transfer/create",
                    show: "/h/transfer/show/:id",
                    meta: { label: tr("Điều chuyển nhân sự"), icon: <SwapOutlined /> },
                  },
                  {
                    name: "hr_personnel_decision",
                    list: "/h/decisions",
                    meta: { label: tr("Quyết định nhân sự"), icon: <SolutionOutlined /> },
                  },
                  {
                    name: "wf_v_inbox",
                    list: "/p/inbox",
                    meta: { label: tr("Hộp việc duyệt"), icon: <InboxOutlined /> },
                  },
                  { name: "search", list: "/i/search", meta: { label: tr("Tìm kiếm"), icon: <SearchOutlined /> } },
                  {
                    name: "audit_log",
                    list: "/admin/audit-logs",
                    meta: { label: tr("Kiểm toán"), icon: <AuditOutlined /> },
                  },
                  { name: "admin_org", list: "/admin/org", meta: { label: tr("Cơ cấu tổ chức") } },
                  { name: "admin_people", list: "/admin/people", meta: { label: tr("Người dùng") } },
                  { name: "admin_roles", list: "/admin/roles", meta: { label: tr("Vai trò & phân quyền") } },
                  { name: "admin_queue", list: "/admin/queue", meta: { label: tr("Hàng đợi tin nhắn") } },
                  { name: "admin_ops", list: "/admin/ops", meta: { label: tr("Vận hành hệ thống") } },
                  {
                    name: "notification_settings",
                    list: "/settings/notifications",
                    meta: { label: tr("Thông báo ngoài ứng dụng") },
                  },
                  { name: "admin_catalog", list: "/admin/catalog", meta: { label: tr("Danh mục & dữ liệu chủ") } },
                  { name: "admin_modules", list: "/admin/modules", meta: { label: tr("Quản lý chức năng") } },
                  { name: "admin_company", list: "/admin/company", meta: { label: tr("Thông tin công ty") } },
                  { name: "collab_notification", meta: { hide: true } },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  liveMode: "auto",
                  disableTelemetry: true,
                }}
              >
                <Suspense fallback={<Spin className="m-10 block" />}>
                  <Routes>
                    <Route
                      element={
                        <Authenticated key="authenticated-inner" fallback={<CatchAllNavigate to="/login" />}>
                          <TenantGate>
                            <ModulesProvider>
                              <BambooLayout>
                                <Suspense fallback={<Spin className="m-10 block" />}>
                                  <Outlet />
                                </Suspense>
                              </BambooLayout>
                            </ModulesProvider>
                          </TenantGate>
                        </Authenticated>
                      }
                    >
                      <Route index element={<DashboardPage />} />
                      <Route
                        path="/h/drive"
                        element={
                          <RequireModule module="files">
                            <DocumentDrivePage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/h/library"
                        element={
                          <RequireModule module="knowledge">
                            <KnowledgeLibraryPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/h/library/proposals/:id"
                        element={
                          <RequireModule module="knowledge">
                            <ProposalPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/p/records"
                        element={
                          <RequireModule module="approval">
                            <RecordsPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/p/tasks"
                        element={
                          <RequireModule module="approval">
                            <InboxPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/p/process"
                        element={
                          <RequireModule module="process">
                            <ProcessDesignPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/d/ops"
                        element={
                          <RequireModule module="data">
                            <OperationsCenterPage />
                          </RequireModule>
                        }
                      />
                      <Route path="/d/map" element={<Navigate to="/d/ops" replace />} />
                      <Route
                        path="/d/services"
                        element={
                          <RequireModule module="data">
                            <DataServicesPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/d/twin"
                        element={
                          <RequireModule module="data">
                            <DigitalTwinPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/d/lineage"
                        element={
                          <RequireModule module="data">
                            <DataLineagePage />
                          </RequireModule>
                        }
                      />
                      <Route path="/d/api" element={<ApiPortalPage />} />
                      <Route path="/h/chat" element={<ChatPage />} />
                      <Route path="/h/chat/:id" element={<ChatPage />} />
                      <Route path="/h/calendar" element={<CalendarPage />} />
                      <Route
                        path="/p/projects"
                        element={
                          <RequireModule module="project">
                            <ProjectListPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/p/projects/:id"
                        element={
                          <RequireModule module="project">
                            <ProjectPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/d/ledger"
                        element={
                          <RequireModule module="ledger">
                            <LedgerPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/i/assistant"
                        element={
                          <RequireModule module="ai">
                            <AiAssistantPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/i/ocr"
                        element={
                          <RequireModule module="ai">
                            <OcrInputPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/i/bi"
                        element={
                          <RequireModule module="data">
                            <BiAnalyticsPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/i/agents"
                        element={
                          <RequireModule module="ai">
                            <AiAgentsPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/p/documents"
                        element={
                          <RequireModule module="procurement">
                            <Outlet />
                          </RequireModule>
                        }
                      >
                        <Route index element={<PurchaseRequestList />} />
                        <Route path="create" element={<PurchaseRequestCreate />} />
                        <Route path="edit/:id" element={<PurchaseRequestEdit />} />
                        <Route path="show/:id" element={<PurchaseRequestShow />} />
                      </Route>
                      <Route
                        path="/p/ic-orders"
                        element={
                          <RequireModule module="ic">
                            <Outlet />
                          </RequireModule>
                        }
                      >
                        <Route index element={<IcOrderList />} />
                        <Route path="show/:id" element={<IcOrderShow />} />
                      </Route>
                      <Route
                        path="/h/onboarding"
                        element={
                          <RequireModule module="hr">
                            <Outlet />
                          </RequireModule>
                        }
                      >
                        <Route index element={<OnboardingList />} />
                        <Route path="create" element={<OnboardingCreate />} />
                        <Route path="edit/:id" element={<OnboardingEdit />} />
                        <Route path="show/:id" element={<OnboardingShow />} />
                      </Route>
                      <Route
                        path="/h/decisions"
                        element={
                          <RequireModule module="hr">
                            <PersonnelDecisionPage />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/h/transfer"
                        element={
                          <RequireModule module="hr">
                            <Outlet />
                          </RequireModule>
                        }
                      >
                        <Route index element={<TransferList />} />
                        <Route path="create" element={<TransferCreate />} />
                        <Route path="show/:id" element={<TransferShow />} />
                        <Route path="cross" element={<CrossTransferList />} />
                        <Route path="cross/show/:id" element={<CrossTransferShow />} />
                        <Route path="leg/in/:id" element={<TransferLegShow kind="in" />} />
                        <Route path="leg/group/:id" element={<TransferLegShow kind="group" />} />
                      </Route>
                      <Route
                        path="/p/inbox"
                        element={
                          <RequireModule module="approval">
                            <InboxList />
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/p/process/:id"
                        element={
                          <RequireModule module="procurement">
                            <Suspense fallback={<Spin />}>
                              <ProcessDiagram />
                            </Suspense>
                          </RequireModule>
                        }
                      />
                      <Route
                        path="/i/search"
                        element={
                          <RequireModule module="search">
                            <SearchPage />
                          </RequireModule>
                        }
                      />
                      <Route path="/admin/audit-logs" element={<AuditLogList />} />
                      <Route path="/admin/org" element={<OrgPage />} />
                      <Route path="/admin/people" element={<PeoplePage />} />
                      <Route path="/admin/roles" element={<RolesPage />} />
                      <Route path="/admin/queue" element={<QueuePage />} />
                      <Route path="/admin/ops" element={<OpsPage />} />
                      <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
                      <Route path="/admin/catalog" element={<CatalogPage />} />
                      <Route path="/admin/modules" element={<ModulesPage />} />
                      <Route path="/admin/company" element={<CompanyPage />} />
                      <Route path="/x/:code/*" element={<ExternalModulePage />} />
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
                    <Route path="/khoi-tao" element={<SetupPage />} />
                    <Route path="/khoi-phuc" element={<RecoveryPage />} />
                  </Routes>
                </Suspense>
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
