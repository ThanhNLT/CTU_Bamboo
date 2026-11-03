// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Descriptions, Spin, Tag, Upload } from "antd";
import { useCallback, useEffect, useState } from "react";

import { request } from "../../../api/client";
import { useSession } from "../../../auth/useSession";
import { Panel } from "../../../components/ui/Panel";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui/buttons";
import { fileToBase64 } from "../../setup/api";
import { AdminHeader } from "../shared/AdminHeader";
import { OwnerTools } from "./OwnerTools";
import { tr } from "../../../i18n";

type LegalStatus = {
  tax_code: string | null;
  legal_name: string | null;
  legal_rep_name: string | null;
  legal_status: "VERIFIED" | "UNVERIFIED" | null;
  is_owner: boolean;
  has_owner: boolean;
  signature_ready: boolean;
  verification: { signer_subject: string; issuer: string; signed_at: string | null; verified_at: string } | null;
};

type LegalApplication = {
  application_id: string;
  nonce: string;
  expires_at: string;
  pdf_base64: string;
  file_name: string;
};

const FIELDS = `tax_code legal_name legal_rep_name legal_status is_owner has_owner signature_ready
  verification { signer_subject issuer signed_at verified_at }`;

const download = (a: LegalApplication) => {
  const bytes = Uint8Array.from(atob(a.pdf_base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = a.file_name;
  link.click();
  URL.revokeObjectURL(url);
};

const STATUS = {
  VERIFIED: <Tag color="green">{tr("Đã xác thực bằng chữ ký số")}</Tag>,
  UNVERIFIED: <Tag color="orange">{tr("Chưa xác thực pháp lý")}</Tag>,
};

/** Thông tin pháp lý của công ty; chủ sở hữu ký số đơn xác thực bổ sung (ADR #57). */
export const CompanyPage = () => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [data, setData] = useState<LegalStatus>();
  const [application, setApplication] = useState<LegalApplication>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      request<{ legal_status: LegalStatus }>(`query Legal { legal_status { ${FIELDS} } }`)
        .then((r) => setData(r.legal_status))
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await request<{ legal_application: LegalApplication }>(
        `mutation LegalApplication { legal_application { application_id nonce expires_at pdf_base64 file_name } }`,
      );
      setApplication(r.legal_application);
      download(r.legal_application);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!application) return;
    setBusy(true);
    try {
      const r = await request<{ legal_verify: LegalStatus }>(
        `mutation LegalVerify($id: uuid!, $content: String!) { legal_verify(application_id: $id, content_base64: $content) { ${FIELDS} } }`,
        { id: application.application_id, content: await fileToBase64(file) },
      );
      setData(r.legal_verify);
      setApplication(undefined);
      message.success(tr("Đã xác thực thông tin pháp lý của công ty bằng chữ ký số."));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <AdminHeader
        title={tr("Thông tin công ty")}
        subtitle={
          <>
            {tr("Thông tin pháp lý và chủ sở hữu của ")} {tenant.tenant_name}
          </>
        }
      />
      <Panel title={tr("Thông tin pháp lý")} extra={data.legal_status && STATUS[data.legal_status]}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={tr("Tên doanh nghiệp")}>{data.legal_name ?? tenant.tenant_name}</Descriptions.Item>
          <Descriptions.Item label={tr("Mã số thuế")}>{data.tax_code ?? tr("Chưa khai")}</Descriptions.Item>
          <Descriptions.Item label={tr("Người đại diện theo pháp luật")}>
            {data.legal_rep_name ?? tr("Chưa khai")}
          </Descriptions.Item>
          {data.verification && (
            <>
              <Descriptions.Item label={tr("Người ký")}>{data.verification.signer_subject}</Descriptions.Item>
              <Descriptions.Item label={tr("Tổ chức chứng thực")}>{data.verification.issuer}</Descriptions.Item>
              <Descriptions.Item label={tr("Xác thực lúc")}>
                {new Date(data.verification.verified_at).toLocaleString("vi-VN")}
              </Descriptions.Item>
            </>
          )}
        </Descriptions>
      </Panel>

      <Panel title={tr("Chủ sở hữu và quyền quản trị")}>
        <p className="m-0 text-[13px] text-body">
          {data.has_owner
            ? tr(
                "Chủ sở hữu (người đại diện theo pháp luật) là người duy nhất trao hoặc thu hồi quyền quản trị: cấp vai trò có quyền quản trị, bổ nhiệm người vào vị trí quản trị. Tài khoản chủ sở hữu và quản trị viên bắt buộc đăng nhập hai lớp.",
              )
            : tr(
                "Công ty tạo trước khi có quy trình khởi tạo nên chưa có chủ sở hữu; quyền quản trị trao theo cách cũ.",
              )}
          {data.is_owner && tr(" Bạn là chủ sở hữu của công ty.")}
        </p>
      </Panel>

      {data.is_owner && <OwnerTools onTransferred={() => void load()} />}

      {data.is_owner && data.legal_status === "UNVERIFIED" && (
        <Panel title={tr("Xác thực bằng chữ ký số")}>
          {!data.signature_ready && (
            <p className="mt-0 text-[13px] text-amber-700">
              {tr(
                "Máy chủ chưa cài chứng thư gốc (thư mục infra/platform/trust): nhờ người quản trị máy chủ cài trước khi ký.",
              )}
            </p>
          )}
          <ol className="mt-0 list-decimal space-y-1.5 pl-5 text-[13px] text-body">
            <li>{tr("Lập đơn xác thực: hệ thống tải về tệp PDF có mã đơn, hiệu lực 30 phút.")}</li>
            <li>{tr("Ký số tệp bằng chữ ký số (USB token) của doanh nghiệp, không sửa tệp.")}</li>
            <li>{tr("Tải tệp đã ký lên.")}</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={start}>
              {application ? tr("Lập lại đơn xác thực") : tr("Lập đơn xác thực")}
            </button>
            {application && (
              <Upload
                accept=".pdf,application/pdf"
                showUploadList={false}
                beforeUpload={(f) => {
                  void upload(f);
                  return false;
                }}
              >
                <button type="button" className={primaryButtonClass} disabled={busy}>
                  {tr("Tải lên đơn đã ký (mã ")} {application.nonce})
                </button>
              </Upload>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
};
