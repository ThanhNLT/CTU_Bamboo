// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Tệp đính kèm (ADR #26): trình duyệt PUT thẳng lên bucket cách ly bằng link có chữ ký, rồi
// confirm_upload kiểm tra, quét virus; chỉ tệp sạch mới tải về được.

// ===== Thư viện =====
import type { ReactElement } from "react"; // React
import { useState } from "react"; // React
import { App, Button, List, Popconfirm, Space, Tag, Tooltip, Typography, Upload } from "antd"; // Ant Design
import {
  BugOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
  StopOutlined,
} from "@ant-design/icons"; // Ant Design Icons

// ===== Module nội bộ =====
import { request } from "../../api/client";
import { formatDate } from "../../utils/format";
import type { DocumentFiles } from "./types";

// ===== Hằng số =====
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt";
const MAX = 25 * 1024 * 1024;

const SCAN: Record<string, { color: string; icon: ReactElement; label: string }> = {
  PENDING: { color: "processing", icon: <LoadingOutlined />, label: "Đang kiểm tra" },
  CLEAN: { color: "success", icon: <CheckCircleOutlined />, label: "Sạch" },
  INFECTED: { color: "error", icon: <BugOutlined />, label: "Nhiễm mã độc – đã xóa" },
  REJECTED: { color: "warning", icon: <StopOutlined />, label: "Bị loại – đã xóa" },
};

// ===== Hàm tiện ích =====
const size = (b: number) => (b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

// ===== Kiểu dữ liệu =====
type Props = {
  doc: DocumentFiles;
  entityType: string;
  me: string;
  canUpload: boolean;
  onChange: () => void;
  hint?: string; // loại giấy tờ gợi ý đính kèm
};

// ===== Component =====
export const Attachments = ({ doc, entityType, me, canUpload, onChange, hint = "báo giá, hóa đơn" }: Props) => {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const locked = ["APPROVED", "REJECTED", "CANCELLED"].includes(doc.status);

  const upload = async (file: File) => {
    if (file.size > MAX) {
      message.error("Tệp phải nhỏ hơn 25 MB");
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
          type: file.type || "application/octet-stream",
          size: file.size,
        },
      );
      const put = await fetch(t.upload_url, { method: "PUT", body: file, headers: { "Content-Type": t.content_type } });
      if (!put.ok) throw new Error(`Tải lên kho lưu trữ thất bại (${put.status})`);
      const { confirm_upload: r } = await request<{ confirm_upload: { status: string; scan_result: string | null } }>(
        `mutation Confirm($a: uuid!) { confirm_upload(attachment_id: $a) { status scan_result } }`,
        { a: t.attachment_id },
      );
      if (r.status === "CLEAN") message.success(`Đã nhận ${file.name}`);
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

  const remove = async (id: string) => {
    try {
      await request(`mutation Del($a: uuid!) { delete_attachment(attachment_id: $a) { status } }`, { a: id });
      onChange();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

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
          <p>Kéo thả hoặc bấm để đính kèm {hint} (PDF, ảnh, DOCX, XLSX, TXT; tối đa 25 MB)</p>
          <Typography.Text type="secondary">
            Tệp được kiểm tra kích thước, định dạng và quét virus trước khi nhận.
          </Typography.Text>
        </Upload.Dragger>
      )}
      <List
        dataSource={doc.attachments}
        locale={{ emptyText: "Chưa có tệp đính kèm" }}
        renderItem={(a) => {
          const s = SCAN[a.status] ?? SCAN.PENDING;
          return (
            <List.Item
              actions={[
                a.status === "CLEAN" && (
                  <Button key="dl" type="link" icon={<DownloadOutlined />} onClick={() => download(a.id)}>
                    Tải về
                  </Button>
                ),
                a.uploaded_by === me && !locked && (
                  <Popconfirm
                    key="rm"
                    title="Xóa tệp này?"
                    okText="Xóa"
                    cancelText="Không"
                    onConfirm={() => remove(a.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Xóa tệp" />
                  </Popconfirm>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={a.file_name}
                description={
                  <Space wrap size={4}>
                    <Tooltip title={a.scan_result}>
                      <Tag color={s.color} icon={s.icon}>
                        {s.label}
                      </Tag>
                    </Tooltip>
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
