// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useLogin } from "@refinedev/core";
import { ThemedTitle } from "@refinedev/antd";
import { Button, Layout, Space, Spin, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import { useLocale } from "../i18n";
import { LOGIN_ATTEMPT_KEY } from "../providers/auth";

// Hai lần tự chuyển trong khoảng này coi như vòng lặp (Keycloak báo lỗi rồi quay về): dừng và cho bấm tay
const LOOP_WINDOW_MS = 8000;

// Keycloak trả `login_required` khi chỉ hỏi "đã đăng nhập chưa" (chưa có phiên): đó là câu trả lời bình thường, không phải lỗi
const cameBackWithError = () =>
  /error=/.test(window.location.hash) && !/error=login_required/.test(window.location.hash);

const recentlyTried = () => {
  if (!cameBackWithError()) return false;
  try {
    const last = Number(sessionStorage.getItem(LOGIN_ATTEMPT_KEY) ?? 0);
    return Date.now() - last < LOOP_WINDOW_MS;
  } catch {
    return false;
  }
};

// Vào thẳng trang nhập tên đăng nhập và mật khẩu của Keycloak, không qua bước bấm nút trung gian
export const Login: React.FC = () => {
  const { mutate: login } = useLogin();
  const { t } = useLocale();
  const started = useRef(false);
  const [manual] = useState(recentlyTried);

  useEffect(() => {
    if (manual || started.current) return;
    started.current = true;
    try {
      sessionStorage.setItem(LOGIN_ATTEMPT_KEY, String(Date.now()));
    } catch {
      // trình duyệt chặn sessionStorage: vẫn chuyển, chỉ mất khả năng chống lặp
    }
    login({});
  }, [login, manual]);

  return (
    <Layout style={{ height: "100vh", justifyContent: "center", alignItems: "center" }}>
      <Space direction="vertical" align="center">
        <ThemedTitle collapsed={false} text="Bamboo DX-OS" wrapperStyles={{ fontSize: "22px", marginBottom: "36px" }} />
        {manual ? (
          <>
            <Typography.Text type="secondary">{t("Không chuyển được tới trang đăng nhập.")}</Typography.Text>
            <Button style={{ width: "240px" }} type="primary" onClick={() => login({})}>
              {t("Thử đăng nhập lại")}
            </Button>
          </>
        ) : (
          <>
            <Spin />
            <Typography.Text type="secondary">{t("Đang chuyển tới trang đăng nhập…")}</Typography.Text>
          </>
        )}
      </Space>
    </Layout>
  );
};
