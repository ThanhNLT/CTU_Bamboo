// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dữ liệu thật cho Ổ đĩa: tệp đính kèm người dùng được xem (core.attachment, máy chủ lọc can_read), tự cập nhật.
// Tệp luôn thuộc một chứng từ, nên "thư mục" là chứng từ; tên thư mục lấy từ api/documents.
import { useList } from "@refinedev/core";
import gql from "graphql-tag";
import { useMemo } from "react";
import { DOC_KIND_LABEL, useDocuments, type DocKind } from "../../api/documents";
import { formatAgo } from "../../utils/format";
import type { DriveFile, DriveFolder, DriveSection, ScanResult, StorageSegment } from "./types";

const FILES = gql`
  query DriveFiles($limit: Int, $offset: Int, $order_by: [core_attachment_order_by!], $where: core_attachment_bool_exp) {
    core_attachment(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id file_name content_type size_bytes status scan_result created_at entity_type entity_id uploaded_by
      uploaded_by_person { full_name }
    }
    core_attachment_aggregate(where: $where) { aggregate { count } }
  }
`;

type Row = {
  id: string; file_name: string; content_type: string; size_bytes: number; status: string; scan_result: string | null;
  created_at: string; entity_type: string; entity_id: string; uploaded_by: string;
  uploaded_by_person: { full_name: string } | null;
};

/** Loại chứng từ nhận tệp đính kèm (storage.ENTITY_TYPES ở actions). */
const ENTITY_TYPE: Partial<Record<DocKind, string>> = {
  purchase_request: "proc.purchase_request", onboarding_request: "hr.onboarding_request",
};

const SCAN: Record<string, ScanResult> = { CLEAN: "clean", INFECTED: "infected", REJECTED: "rejected", PENDING: "pending" };
const RECENT_DAYS = 7;

const category = (contentType: string) =>
  contentType.startsWith("image/") ? "images"
    : /pdf|word|sheet|text|document/.test(contentType) ? "docs" : "other";

export const useDrive = (section: DriveSection, me: string, folderId?: string) => {
  const files = useList<Row>({
    resource: "core_attachment",
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { pageSize: 500 },
    meta: { gqlQuery: FILES },
    liveMode: "auto",
  });
  const docs = useDocuments({ limit: 500 });

  const rows = files.result.data;
  const all = useMemo(() => rows.map((r): DriveFile => ({
    id: r.id, name: r.file_name, owner: r.uploaded_by_person?.full_name ?? "—", ownerId: r.uploaded_by,
    entityId: r.entity_id, contentType: r.content_type, updatedAt: r.created_at, updatedLabel: formatAgo(r.created_at),
    bytes: r.size_bytes, scan: SCAN[r.status] ?? "pending",
  })), [rows]);
  const entityTypes = useMemo(() => new Map(rows.map((r) => [r.entity_id, r.entity_type])), [rows]);

  const inSection = useMemo(() => {
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    return all.filter((f) =>
      section === "mine" ? f.ownerId === me : section === "recent" ? Date.parse(f.updatedAt) >= since : true);
  }, [all, section, me]);

  const docById = useMemo(() => new Map(docs.documents.map((d) => [d.id, d])), [docs.documents]);

  const folders = useMemo(() => {
    const byDoc = new Map<string, DriveFolder>();
    for (const f of inSection) {
      const d = docById.get(f.entityId);
      const folder = byDoc.get(f.entityId) ?? {
        id: f.entityId,
        name: d ? `${d.code} · ${d.title}` : f.entityId,
        entityType: entityTypes.get(f.entityId) ?? "",
        to: d?.to,
        fileCount: 0,
        bytes: 0,
      };
      folder.fileCount += 1;
      folder.bytes += f.bytes ?? 0;
      byDoc.set(f.entityId, folder);
    }
    return [...byDoc.values()];
  }, [inSection, docById, entityTypes]);

  const storage: StorageSegment[] = useMemo(() => {
    const sum = (key: string) => all.filter((f) => f.scan === "clean" && category(f.contentType) === key)
      .reduce((s, f) => s + (f.bytes ?? 0), 0);
    return [
      { key: "docs", label: "Tài liệu", bytes: sum("docs"), className: "bg-bamboo-700" },
      { key: "images", label: "Hình ảnh", bytes: sum("images"), className: "bg-bamboo-300" },
      { key: "other", label: "Khác", bytes: sum("other"), className: "bg-gray-500" },
    ];
  }, [all]);

  const doc = folderId ? docById.get(folderId) : undefined;
  // Chứng từ chưa có tệp vẫn mở được làm thư mục (để tải tệp đầu tiên), nếu loại chứng từ nhận tệp đính kèm.
  const folder = folderId
    ? folders.find((f) => f.id === folderId)
      ?? (doc && ENTITY_TYPE[doc.kind]
        ? { id: doc.id, name: `${doc.code} · ${doc.title}`, entityType: ENTITY_TYPE[doc.kind]!, to: doc.to, fileCount: 0, bytes: 0 }
        : null)
    : null;

  return {
    folders,
    files: folderId ? inSection.filter((f) => f.entityId === folderId) : inSection,
    folder,
    /** Mô tả ngắn của thư mục đang mở ("Đề nghị mua sắm · Chờ duyệt"). */
    folderHint: doc ? `${DOC_KIND_LABEL[doc.kind]} · ${doc.statusLabel}` : undefined,
    /** Trạng thái gốc của chứng từ đang mở (tệp chỉ thêm được khi chứng từ chưa có kết quả). */
    folderStatus: doc?.status,
    storage,
    loading: files.query.isLoading,
    error: files.query.error?.message ?? docs.error,
  };
};
