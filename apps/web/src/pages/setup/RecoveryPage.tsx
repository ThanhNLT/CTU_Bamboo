// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Button, Card, Form, Input, Layout, Steps, Typography, Upload } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router";

import { fileToBase64, finishRecovery, recoveryPdfUrl, startRecovery, type Recovery } from "./api";

/** Chủ sở hữu mất mật khẩu hoặc mã OTP: ký số đơn khôi phục bằng chữ ký số doanh nghiệp (ADR #57). */
export const RecoveryPage = () => {
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState<Recovery>();
  const [result, setResult] = useState<{ tenant_name: string; username: string; password: string }>();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await job();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const step = result ? 2 : recovery ? 1 : 0;
  return (
    <Layout style={{ minHeight: "100vh" }} className="items-center px-4 py-10">
      <Card className="w-full max-w-[720px]" title="Khôi phục tài khoản chủ sở hữu">
        <Steps
          current={step}
          className="mb-6"
          items={[{ title: "Mã số thuế" }, { title: "Ký đơn" }, { title: "Hoàn tất" }]}
        />
        {step === 0 && (
          <Form
            layout="vertical"
            onFinish={(v: { tax_code: string }) => run(async () => setRecovery(await startRecovery(v.tax_code)))}
          >
            <Typography.Paragraph type="secondary">
              Dùng khi chủ sở hữu mất mật khẩu hoặc thiết bị cài mã xác thực hai lớp. Người đại diện theo pháp luật ký
              số đơn khôi phục bằng chữ ký số của doanh nghiệp; mọi quản trị viên của công ty được thông báo.
            </Typography.Paragraph>
            <Form.Item
              name="tax_code"
              label="Mã số thuế của công ty"
              rules={[
                { required: true, message: "Nhập mã số thuế" },
                { pattern: /^\d{10}(-\d{3})?$/, message: "10 chữ số, hoặc dạng 0101234567-001" },
              ]}
            >
              <Input inputMode="numeric" />
            </Form.Item>
            {error && <Alert type="error" showIcon message={error} className="mb-4" />}
            <Button type="primary" htmlType="submit" loading={busy}>
              Lập đơn khôi phục
            </Button>
          </Form>
        )}
        {step === 1 && recovery && (
          <div className="space-y-4">
            <Typography.Paragraph>
              Công ty <strong>{recovery.tenant_name}</strong>. Mã đơn{" "}
              <Typography.Text code>{recovery.nonce}</Typography.Text>, hết hạn lúc{" "}
              {new Date(recovery.expires_at).toLocaleTimeString("vi-VN")}.
            </Typography.Paragraph>
            <ol className="list-decimal space-y-2 pl-5 text-[13.5px]">
              <li>
                <a href={recoveryPdfUrl(recovery)} download>
                  Tải đơn khôi phục (PDF)
                </a>
                .
              </li>
              <li>Người đại diện ký số tệp bằng chữ ký số của doanh nghiệp, không sửa tệp.</li>
              <li>Tải tệp đã ký lên dưới đây.</li>
            </ol>
            <Upload.Dragger
              accept=".pdf,application/pdf"
              maxCount={1}
              beforeUpload={(f) => {
                setFile(f);
                return false;
              }}
              onRemove={() => setFile(undefined)}
            >
              <p className="py-2 text-[13.5px]">Kéo thả hoặc bấm để chọn đơn đã ký số (PDF, tối đa 5 MB)</p>
            </Upload.Dragger>
            {error && <Alert type="error" showIcon message={error} />}
            <Button
              type="primary"
              disabled={!file}
              loading={busy}
              onClick={() =>
                file && run(async () => setResult(await finishRecovery(recovery, await fileToBase64(file))))
              }
            >
              Gửi đơn đã ký
            </Button>
          </div>
        )}
        {step === 2 && result && (
          <div className="space-y-4">
            <Alert type="success" showIcon message={`Đã khôi phục tài khoản chủ sở hữu của ${result.tenant_name}`} />
            <Typography.Paragraph>
              Tên đăng nhập <Typography.Text code>{result.username}</Typography.Text>, mật khẩu tạm{" "}
              <Typography.Text code copyable>
                {result.password}
              </Typography.Text>{" "}
              (chỉ hiện một lần). Lần đăng nhập tới phải đổi mật khẩu và cài lại mã xác thực hai lớp.
            </Typography.Paragraph>
            <Button type="primary" onClick={() => navigate("/login")}>
              Đăng nhập
            </Button>
          </div>
        )}
      </Card>
    </Layout>
  );
};
