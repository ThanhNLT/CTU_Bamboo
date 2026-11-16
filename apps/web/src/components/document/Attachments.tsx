/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import type { ReactElement } from "react";
import { useState } from "react";
import { App, Button, List, Popconfirm, Space, Tag, Tooltip, Typography, Upload } from "antd";
import {
  BugOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RedoOutlined,
  StopOutlined,
} from "@ant-design/icons";

import { request } from "../../api/client";
import { usePolling } from "../../live/usePolling";
import { uploadContentType } from "../../utils/fileType";
import { useModules } from "../../modules/useModules";
import { formatDate } from "../../utils/format";
import type { AttachmentOcr, DocumentFiles } from "./types";
import { tr, trf } from "../../i18n";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.csv,.md";
const MAX = 25 * 1024 * 1024;

const SCAN: Record<string, { color: string; icon: ReactElement; label: string }> = {
  PENDING: { color: "processing", icon: <LoadingOutlined />, label: tr("Đang kiểm tra") },
  CLEAN: { color: "success", icon: <CheckCircleOutlined />, label: tr("Đã quét – sạch") },
  INFECTED: { color: "error", icon: <BugOutlined />, label: tr("Nhiễm mã độc – đã xóa") },
  REJECTED: { color: "warning", icon: <StopOutlined />, label: tr("Bị loại – đã xóa") },
};

const awaitingRescan = (a: { status: string; scan_engines?: string[] }) =>
  a.status === "CLEAN" && (a.scan_engines ?? []).every((e) => e === "unscanned") && (a.scan_engines ?? []).length > 0;

const scanTag = (a: { status: string; scan_engines?: string[] }) =>
  awaitingRescan(a)
    ? { color: "processing", icon: <LoadingOutlined />, label: tr("Chờ quét lại") }
    : (SCAN[a.status] ?? SCAN.PENDING);

const scanTip = (a: { scan_result: string | null; scan_engines?: string[] }) =>
  [
    a.scan_result,
    a.scan_engines?.length && !a.scan_engines.includes("unscanned")
      ? trf("Công cụ: {0}", [a.scan_engines.join("; ")])
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

const OCR_POLL_MS = 5000;

const ocrTag = (o: AttachmentOcr): { color: string; icon: ReactElement; label: string; tip: string | null } | null => {
  switch (o.status) {
    case "PENDING":
      return { color: "default", icon: <FileSearchOutlined />, label: tr("Chờ OCR"), tip: null };
    case "RUNNING":
      return {
        color: "processing",
        icon: <LoadingOutlined />,
        label: trf("Đang OCR {0}/{1} trang", [o.pages_done, o.pages_total ?? "?"]),
        tip: o.note,
      };
    case "DONE":
      return { color: "success", icon: <FileSearchOutlined />, label: tr("Đã OCR"), tip: o.note };
    case "ERROR":
      return { color: "error", icon: <FileSearchOutlined />, label: tr("OCR lỗi"), tip: o.error };
    default:
      return null;
  }
};

const size = (b: number) => (b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

type Props = {
  doc: DocumentFiles;
  entityType: string;
  me: string;
  canUpload: boolean;
  onChange: () => void;
  hint?: string;
};

export const Attachments = ({ doc, entityType, me, canUpload, onChange, hint = tr("báo giá, hóa đơn") }: Props) => {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const locked = ["APPROVED", "REJECTED", "CANCELLED"].includes(doc.status);
  const ocrBusy = doc.attachments.some((a) => a.ocr && ["PENDING", "RUNNING"].includes(a.ocr.status));
  const files = useModules().enabled("files");

  usePolling(onChange, OCR_POLL_MS, ocrBusy);

  const upload = async (file: File) => {
    if (file.size > MAX) {
      message.error(tr("Tệp phải nhỏ hơn 25 MB"));
      return;
    }
    setUploading(true);
    try {
      const { get_upload_url: t } = await request<{
        get_upload_url: { attachment_id: string; upload_url: string; content_type: string };
      }>(
        `mutation Up($entity: String!, $id: uuid!, $name: String!, $type: String!, $size: Int!) {
           get_upload_url(entity_type: $entity, entity_id: $id, file_name: $name, content_type: $type, size_bytes: $size) {
             attachment_id upload_url content_type } }`,
        {
          entity: entityType,
          id: doc.id,
          name: file.name,
          type: uploadContentType(file),
          size: file.size,
        },
      );
      const put = await fetch(t.upload_url, { method: "PUT", body: file, headers: { "Content-Type": t.content_type } });
      if (!put.ok) throw new Error(trf("Tải lên kho lưu trữ thất bại ({0})", [put.status]));
      const { confirm_upload: r } = await request<{ confirm_upload: { status: string; scan_result: string | null } }>(
        `mutation Confirm($a: uuid!) { confirm_upload(attachment_id: $a) { status scan_result } }`,
        { a: t.attachment_id },
      );
      if (r.status === "CLEAN") message.success(trf("Đã nhận {0}", [file.name]));
      else message.warning(`${file.name}: ${r.scan_result ?? r.status}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
      onChange();
    }
  };

  const download = async (id: string) => {
    try {
      const { get_download_url } = await request<{ get_download_url: { url: string } }>(
        `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
        { a: id },
      );
      window.open(get_download_url.url, "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const retryOcr = async (id: string) => {
    try {
      await request(`mutation Ocr($a: uuid!) { ocr_retry(attachment_id: $a) { status } }`, { a: id });
      onChange();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await request(`mutation Del($a: uuid!) { delete_attachment(attachment_id: $a) { status } }`, { a: id });
      onChange();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  if (!files)
    return (
      <Typography.Text type="secondary">
        {tr("Chức năng Ổ đĩa & tệp đính kèm chưa được bật cho công ty; quản trị viên bật ở trang Quản lý chức năng.")}
      </Typography.Text>
    );

  return (
    <>
      {canUpload && !locked && (
        <Upload.Dragger
          accept={ACCEPT}
          showUploadList={false}
          disabled={uploading}
          customRequest={({ file }) => {
            void upload(file as File);
          }}
        >
          <p className="ant-upload-drag-icon">{uploading ? <LoadingOutlined /> : <CloudUploadOutlined />}</p>
          <p>
            {tr("Kéo thả hoặc bấm để đính kèm ")} {hint} {tr(" (PDF, ảnh, DOCX, XLSX, TXT; tối đa 25 MB)")}
          </p>
          <Typography.Text type="secondary">
            {tr(
              "Tệp được kiểm tra kích thước, định dạng, mã chủ động nhúng (macro, script, tệp thực thi) và quét virus xong mới được xác nhận là sạch.",
            )}
          </Typography.Text>
        </Upload.Dragger>
      )}
      <List
        dataSource={doc.attachments}
        locale={{ emptyText: tr("Chưa có tệp đính kèm") }}
        renderItem={(a) => {
          const s = scanTag(a);
          const o = a.ocr ? ocrTag(a.ocr) : null;
          return (
            <List.Item
              actions={[
                a.status === "CLEAN" && !awaitingRescan(a) && (
                  <Button key="dl" type="link" icon={<DownloadOutlined />} onClick={() => download(a.id)}>
                    {tr("Tải về")}
                  </Button>
                ),
                a.uploaded_by === me && !locked && (
                  <Popconfirm
                    key="rm"
                    title={tr("Xóa tệp này?")}
                    okText={tr("Xóa")}
                    cancelText={tr("Không")}
                    onConfirm={() => remove(a.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label={tr("Xóa tệp")} />
                  </Popconfirm>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={a.file_name}
                description={
                  <Space wrap size={4}>
                    <Tooltip title={scanTip(a)}>
                      <Tag color={s.color} icon={s.icon}>
                        {s.label}
                      </Tag>
                    </Tooltip>
                    {o && (
                      <Tooltip title={o.tip}>
                        <Tag color={o.color} icon={o.icon}>
                          {o.label}
                        </Tag>
                      </Tooltip>
                    )}
                    {a.ocr?.status === "ERROR" && (
                      <Button size="small" type="link" icon={<RedoOutlined />} onClick={() => retryOcr(a.id)}>
                        {tr("Thử lại OCR")}
                      </Button>
                    )}
                    <span>{size(a.size_bytes)}</span>·<span>{a.uploaded_by_person?.full_name}</span>·
                    <span>{formatDate(a.created_at)}</span>
                  </Space>
                }
              />
            </List.Item>
          );
        }}
      />
    </>
  );
};
