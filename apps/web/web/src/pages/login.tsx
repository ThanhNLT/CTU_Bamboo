// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useLogin } from "@refinedev/core";
import { ThemedTitle } from "@refinedev/antd";
import { Button, Typography, Layout, Space } from "antd";

export const Login: React.FC = () => {
  const { mutate: login } = useLogin();

  return (
    <Layout
      style={{
        height: "100vh",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Space direction="vertical" align="center">
        <ThemedTitle
          collapsed={false}
          text="Bamboo DX-OS"
          wrapperStyles={{
            fontSize: "22px",
            marginBottom: "36px",
          }}
        />
        <Button style={{ width: "240px" }} type="primary" size="middle" onClick={() => login({})}>
          Đăng nhập bằng tài khoản tập đoàn
        </Button>
        <Typography.Text type="secondary">Xác thực qua Keycloak</Typography.Text>
      </Space>
    </Layout>
  );
};
