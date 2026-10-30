// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Alert, Button, Card, Checkbox, Form, Input, Layout, Spin, Steps, Table, Typography, Upload } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import {
  applicationPdfUrl,
  createApplication,
  fileToBase64,
  finishSetup,
  setupStatus,
  type Account,
  type Application,
  type Company,
  type SetupResult,
  type SetupStatus,
} from "./api";

type Values = { setup_code: string; company: Company; owner: Account; with_admin: boolean; admin?: Account };

const required = (label: string) => [{ required: true, message: `Nhập ${label}` }];

const InfoStep = ({ onDone }: { onDone: (a: Application) => void }) => {
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const withAdmin = Form.useWatch("with_admin", form);

  const submit = async (v: Values) => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(
        await createApplication({
          setup_code: v.setup_code,
          company: v.company,
          owner: v.owner,
          admin: v.with_admin ? v.admin : null,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={submit} initialValues={{ company: { legal_rep_title: "Giám đốc" } }}>
      <Form.Item
        name="setup_code"
        label="Mã thiết lập"
        rules={required("mã thiết lập")}
        extra="Mã in trong log máy chủ khi hệ thống khởi động lần đầu (docker compose logs bootstrap); người quản trị máy chủ lấy mã mới bằng lệnh docker compose run --rm actions python -m app.setup_code"
      >
        <Input placeholder="XXXX-XXXX-XXXX" autoComplete="off" />
      </Form.Item>

      <Typography.Title level={5}>Doanh nghiệp (theo giấy chứng nhận đăng ký doanh nghiệp)</Typography.Title>
      <Form.Item name={["company", "legal_name"]} label="Tên doanh nghiệp" rules={required("tên doanh nghiệp")}>
        <Input placeholder="Công ty Cổ phần ABC" />
      </Form.Item>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <Form.Item
          name={["company", "tax_code"]}
          label="Mã số thuế"
          rules={[
            ...required("mã số thuế"),
            { pattern: /^\d{10}(-\d{3})?$/, message: "10 chữ số, hoặc dạng 0101234567-001" },
          ]}
        >
          <Input placeholder="0101234567" inputMode="numeric" />
        </Form.Item>
        <Form.Item
          name={["company", "code"]}
          label="Mã công ty trên hệ thống"
          rules={[
            ...required("mã công ty"),
            { pattern: /^[A-Za-z][A-Za-z0-9_]{1,19}$/, message: "Chữ không dấu, số, gạch dưới; 2-20 ký tự" },
          ]}
          normalize={(v: string) => v?.toUpperCase()}
        >
          <Input placeholder="ABC" />
        </Form.Item>
        <Form.Item name={["company", "short_name"]} label="Tên hiển thị (không bắt buộc)">
          <Input placeholder="ABC" />
        </Form.Item>
      </div>
      <Form.Item name={["company", "address"]} label="Địa chỉ trụ sở chính" rules={required("địa chỉ")}>
        <Input />
      </Form.Item>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item
          name={["company", "legal_rep_name"]}
          label="Người đại diện theo pháp luật"
          rules={required("họ tên người đại diện")}
        >
          <Input placeholder="Nguyễn Văn An" />
        </Form.Item>
        <Form.Item name={["company", "legal_rep_title"]} label="Chức danh">
          <Input />
        </Form.Item>
      </div>

      <Typography.Title level={5}>Tài khoản chủ sở hữu (người đại diện)</Typography.Title>
      <Typography.Paragraph type="secondary">
        Chủ sở hữu là người duy nhất được trao, thu hồi quyền quản trị. Lần đăng nhập đầu phải đổi mật khẩu và cài mã
        xác thực hai lớp (ứng dụng Google Authenticator, Microsoft Authenticator…).
      </Typography.Paragraph>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item name={["owner", "username"]} label="Tên đăng nhập" rules={required("tên đăng nhập")}>
          <Input placeholder="an.nguyen" autoComplete="off" />
        </Form.Item>
        <Form.Item name={["owner", "email"]} label="Email" rules={[{ type: "email", message: "Email không hợp lệ" }]}>
          <Input />
        </Form.Item>
      </div>

      <Form.Item name="with_admin" valuePropName="checked">
        <Checkbox>Tạo thêm tài khoản quản trị viên (nhân viên CNTT vận hành hằng ngày)</Checkbox>
      </Form.Item>
      {withAdmin && (
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Form.Item name={["admin", "full_name"]} label="Họ tên" rules={required("họ tên")}>
            <Input />
          </Form.Item>
          <Form.Item name={["admin", "username"]} label="Tên đăng nhập" rules={required("tên đăng nhập")}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name={["admin", "email"]} label="Email" rules={[{ type: "email", message: "Email không hợp lệ" }]}>
            <Input />
          </Form.Item>
        </div>
      )}

      {error && <Alert type="error" showIcon message={error} className="mb-4" />}
      <Button type="primary" htmlType="submit" loading={busy}>
        Lập đơn đăng ký
      </Button>
    </Form>
  );
};

const SignStep = ({
  application,
  status,
  onDone,
}: {
  application: Application;
  status: SetupStatus;
  onDone: (r: SetupResult) => void;
}) => {
  const { modal } = App.useApp();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const finish = async (signed?: File) => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await finishSetup(application, signed ? await fileToBase64(signed) : undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unverified = () =>
    modal.confirm({
      title: "Tạo công ty chưa xác thực pháp lý?",
      content:
        "Công ty được tạo ngay và đánh dấu “chưa xác thực”. Chủ sở hữu ký số đơn xác thực sau ở Quản trị → Thông tin công ty khi có chữ ký số và Internet.",
      okText: "Tạo công ty",
      cancelText: "Quay lại",
      onOk: () => finish(),
    });

  return (
    <div className="space-y-4">
      <Typography.Paragraph>
        Mã đơn <Typography.Text code>{application.nonce}</Typography.Text>, hết hạn lúc{" "}
        {new Date(application.expires_at).toLocaleTimeString("vi-VN")}.
      </Typography.Paragraph>
      <ol className="list-decimal space-y-2 pl-5 text-[13.5px]">
        <li>
          <a href={applicationPdfUrl(application)} download>
            Tải đơn đăng ký (PDF)
          </a>
          .
        </li>
        <li>
          Người đại diện theo pháp luật ký số tệp bằng chữ ký số (USB token) của doanh nghiệp: phần mềm ký của nhà cung
          cấp chữ ký số hoặc Adobe Acrobat Reader. Không sửa, không in rồi quét lại tệp.
        </li>
        <li>Tải tệp đã ký lên dưới đây.</li>
      </ol>
      {!status.signature_ready && (
        <Alert
          type="warning"
          showIcon
          message="Máy chủ chưa cài chứng thư gốc để kiểm chữ ký số"
          description="Người quản trị máy chủ đặt chứng thư Root CA quốc gia vào thư mục platform/trust (xem hướng dẫn trong thư mục đó). Trong lúc chờ, có thể tạo công ty chưa xác thực rồi ký bổ sung sau."
        />
      )}
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
      <div className="flex flex-wrap gap-2">
        <Button type="primary" disabled={!file} loading={busy} onClick={() => finish(file)}>
          Gửi đơn đã ký và tạo công ty
        </Button>
        {status.allow_unverified && (
          <Button disabled={busy} onClick={unverified}>
            Chưa có chữ ký số: tạo công ty chưa xác thực
          </Button>
        )}
      </div>
    </div>
  );
};

const DoneStep = ({ result }: { result: SetupResult }) => {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <Alert
        type={result.legal_status === "VERIFIED" ? "success" : "warning"}
        showIcon
        message={`Đã tạo công ty ${result.tenant_name}`}
        description={
          result.legal_status === "VERIFIED"
            ? `Đã xác thực pháp lý bằng chữ ký số của ${result.signer}.`
            : "Công ty chưa xác thực pháp lý: chủ sở hữu ký số bổ sung ở Quản trị → Thông tin công ty."
        }
      />
      <Typography.Paragraph strong>
        Mật khẩu tạm chỉ hiện một lần. Ghi lại và trao tận tay từng người; lần đăng nhập đầu phải đổi mật khẩu và cài mã
        xác thực hai lớp.
      </Typography.Paragraph>
      <Table
        rowKey="username"
        pagination={false}
        size="small"
        dataSource={result.accounts}
        columns={[
          { title: "Vai trò", dataIndex: "role" },
          { title: "Tên đăng nhập", dataIndex: "username" },
          {
            title: "Mật khẩu tạm",
            dataIndex: "password",
            render: (v: string) => (
              <Typography.Text copyable code>
                {v}
              </Typography.Text>
            ),
          },
        ]}
      />
      <Button type="primary" onClick={() => navigate("/login")}>
        Đăng nhập
      </Button>
    </div>
  );
};

/** Khởi tạo công ty lần đầu trên máy chủ tự cài (ADR #57). */
export const SetupPage = () => {
  const [status, setStatus] = useState<SetupStatus>();
  const [application, setApplication] = useState<Application>();
  const [result, setResult] = useState<SetupResult>();

  useEffect(() => {
    void setupStatus().then(setStatus);
  }, []);

  const step = result ? 2 : application ? 1 : 0;
  return (
    <Layout style={{ minHeight: "100vh" }} className="items-center px-4 py-10">
      <Card className="w-full max-w-[860px]" title="Tạo công ty mới trên Bamboo DX-OS">
        {!status ? (
          <Spin />
        ) : !status.open && !result ? (
          <Alert
            type="info"
            showIcon
            message="Hệ thống đã có công ty"
            description="Trang khởi tạo chỉ dùng một lần khi cài đặt. Đăng nhập bằng tài khoản đã được cấp; công ty thành viên do chủ sở hữu tạo từ bên trong."
            action={
              <div className="flex flex-col items-end gap-1">
                <a href="/login">Đăng nhập</a>
                <a href="/khoi-phuc">Khôi phục tài khoản chủ sở hữu</a>
              </div>
            }
          />
        ) : (
          <>
            <Steps
              current={step}
              className="mb-6"
              items={[{ title: "Thông tin" }, { title: "Ký đơn" }, { title: "Hoàn tất" }]}
            />
            {step === 0 && <InfoStep onDone={setApplication} />}
            {step === 1 && application && <SignStep application={application} status={status} onDone={setResult} />}
            {step === 2 && result && <DoneStep result={result} />}
          </>
        )}
      </Card>
    </Layout>
  );
};
