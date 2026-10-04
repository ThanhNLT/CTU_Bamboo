// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import {
  Refine,
  GitHubBanner,
  Authenticated,
  AuthProvider,
} from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import {
  ErrorComponent,
  useNotificationProvider,
  ThemedLayout,
  ThemedSider,
} from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import dataProvider, {
  GraphQLClient,
  graphqlWS,
  liveProvider,
} from "@refinedev/hasura";
import { App as AntdApp } from "antd";
import { BrowserRouter, Route, Routes, Outlet } from "react-router";
import routerProvider, {
  NavigateToResource,
  CatchAllNavigate,
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router";
import axios from "axios";
import { useKeycloak } from "@react-keycloak/web";
import {
  BlogPostList,
  BlogPostCreate,
  BlogPostEdit,
  BlogPostShow,
} from "./pages/blog-posts";
import {
  CategoryList,
  CategoryCreate,
  CategoryEdit,
  CategoryShow,
} from "./pages/categories";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { Header } from "./components/header";
import { Login } from "./pages/login";

// Hasura của dự án; xác thực bằng webhook: token Keycloak + tenant đã chọn (ADR #32,
// docs/thiet-ke/08-api-giao-dien.md). Chưa chọn tenant thì chỉ gọi được query my_tenants.
const API_URL = import.meta.env.VITE_HASURA_URL ?? "http://localhost:8081/v1/graphql";
const WS_URL = API_URL.replace(/^http/, "ws");
const TENANT_KEY = "bamboo.tenant";

const authHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenant = localStorage.getItem(TENANT_KEY);
  if (tenant) headers["x-bamboo-tenant"] = tenant;
  return headers;
};

const client = new GraphQLClient(API_URL);
let currentToken: string | undefined;

const webSocketClient = graphqlWS.createClient({
  url: WS_URL,
  connectionParams: () => ({ headers: authHeaders(currentToken) }),
});

function App() {
  const { keycloak, initialized } = useKeycloak();

  if (!initialized) {
    return <div>Loading...</div>;
  }

  const authProvider: AuthProvider = {
    login: async () => {
      const urlSearchParams = new URLSearchParams(window.location.search);
      const { to } = Object.fromEntries(urlSearchParams.entries());
      await keycloak.login({
        redirectUri: to ? `${window.location.origin}${to}` : undefined,
      });
      return {
        success: true,
      };
    },
    logout: async () => {
      try {
        await keycloak.logout({
          redirectUri: window.location.origin,
        });
        return {
          success: true,
          redirectTo: "/login",
        };
      } catch {
        return {
          success: false,
          error: new Error("Logout failed"),
        };
      }
    },
    onError: async (error) => {
      console.error(error);
      return { error };
    },
    check: async () => {
      try {
        await keycloak.updateToken(30);
        const { token } = keycloak;
        if (token) {
          currentToken = token;
          client.setHeaders(authHeaders(token));
          axios.defaults.headers.common = {
            Authorization: `Bearer ${token}`,
          };
          return {
            authenticated: true,
          };
        } else {
          return {
            authenticated: false,
            logout: true,
            redirectTo: "/login",
            error: {
              message: "Check failed",
              name: "Token not found",
            },
          };
        }
      } catch {
        return {
          authenticated: false,
          logout: true,
          redirectTo: "/login",
          error: {
            message: "Check failed",
            name: "Token not found",
          },
        };
      }
    },
    getPermissions: async () => null,
    getIdentity: async () => {
      if (keycloak?.tokenParsed) {
        return {
          name: keycloak.tokenParsed.family_name,
        };
      }
      return null;
    },
  };

  return (
    <BrowserRouter>
      <GitHubBanner />
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <AntdApp>
              <Refine
                dataProvider={dataProvider(client)}
                liveProvider={liveProvider(webSocketClient)}
                notificationProvider={useNotificationProvider}
                routerProvider={routerProvider}
                authProvider={authProvider}
                resources={[
                  {
                    name: "blog_posts",
                    list: "/blog-posts",
                    create: "/blog-posts/create",
                    edit: "/blog-posts/edit/:id",
                    show: "/blog-posts/show/:id",
                    meta: {
                      canDelete: true,
                    },
                  },
                  {
                    name: "categories",
                    list: "/categories",
                    create: "/categories/create",
                    edit: "/categories/edit/:id",
                    show: "/categories/show/:id",
                    meta: {
                      canDelete: true,
                    },
                  },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  projectId: "v5edDH-KsC4mO-GFP98r",
                  liveMode: "auto",
                }}
              >
                <Routes>
                  <Route
                    element={
                      <Authenticated
                        key="authenticated-inner"
                        fallback={<CatchAllNavigate to="/login" />}
                      >
                        <ThemedLayout
                          Header={Header}
                          Sider={(props) => <ThemedSider {...props} fixed />}
                        >
                          <Outlet />
                        </ThemedLayout>
                      </Authenticated>
                    }
                  >
                    <Route
                      index
                      element={<NavigateToResource resource="blog_posts" />}
                    />
                    <Route path="/blog-posts">
                      <Route index element={<BlogPostList />} />
                      <Route path="create" element={<BlogPostCreate />} />
                      <Route path="edit/:id" element={<BlogPostEdit />} />
                      <Route path="show/:id" element={<BlogPostShow />} />
                    </Route>
                    <Route path="/categories">
                      <Route index element={<CategoryList />} />
                      <Route path="create" element={<CategoryCreate />} />
                      <Route path="edit/:id" element={<CategoryEdit />} />
                      <Route path="show/:id" element={<CategoryShow />} />
                    </Route>
                    <Route path="*" element={<ErrorComponent />} />
                  </Route>
                  <Route
                    element={
                      <Authenticated
                        key="authenticated-outer"
                        fallback={<Outlet />}
                      >
                        <NavigateToResource />
                      </Authenticated>
                    }
                  >
                    <Route path="/login" element={<Login />} />
                  </Route>
                </Routes>

                <RefineKbar />
                <UnsavedChangesNotifier />
                <DocumentTitleHandler />
              </Refine>
          </AntdApp>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
