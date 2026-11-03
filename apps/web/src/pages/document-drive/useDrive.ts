// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useList } from "@refinedev/core";
import gql from "graphql-tag";
import { useMemo } from "react";

import { DOC_KIND_LABEL, useDocuments, type DocKind } from "../../api/documents";
import { formatAgo } from "../../utils/format";
import type { DriveFile, DriveFolder, DriveSection, ScanResult, StorageSegment } from "./types";
import { tr } from "../../i18n";

const FILES = gql`
  query DriveFiles(
    $limit: Int
    $offset: Int
    $order_by: [core_attachment_order_by!]
    $where: core_attachment_bool_exp
  ) {
    core_attachment(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      file_name
      content_type
      size_bytes
      status
      scan_result
      scan_engines
      created_at
      entity_type
      entity_id
      uploaded_by
      uploaded_by_person {
        full_name
      }
    }
    core_attachment_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

type Row = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  scan_result: string | null;
  scan_engines?: string[];
  created_at: string;
  entity_type: string;
  entity_id: string;
  uploaded_by: string;
  uploaded_by_person: { full_name: string } | null;
};

const ENTITY_TYPE: Partial<Record<DocKind, string>> = {
  purchase_request: "proc.purchase_request",
  onboarding_request: "hr.onboarding_request",
  kb_document: "collab.kb_document",
};

const SCAN: Record<string, ScanResult> = {
  CLEAN: "clean",
  INFECTED: "infected",
  REJECTED: "rejected",
  PENDING: "pending",
};
// Tệp cũ chưa từng được quét: coi như đang kiểm tra cho tới khi hệ thống quét lại xong
const scanOf = (row: { status: string; scan_engines?: string[] }): ScanResult =>
  row.status === "CLEAN" && (row.scan_engines ?? []).includes("unscanned")
    ? "pending"
    : (SCAN[row.status] ?? "pending");
const RECENT_DAYS = 7;
const EDITABLE = new Set(["DRAFT", "PENDING", "RETURNED"]);

const category = (contentType: string) =>
  contentType.startsWith("image/") ? "images" : /pdf|word|sheet|text|document/.test(contentType) ? "docs" : "other";

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
  const docById = useMemo(() => new Map(docs.documents.map((d) => [d.id, d])), [docs.documents]);
  const all = useMemo(
    () =>
      rows.map((r): DriveFile => ({
        id: r.id,
        name: r.file_name,
        owner: r.uploaded_by_person?.full_name ?? "—",
        ownerId: r.uploaded_by,
        entityId: r.entity_id,
        contentType: r.content_type,
        updatedAt: r.created_at,
        updatedLabel: formatAgo(r.created_at),
        bytes: r.size_bytes,
        scan: scanOf(r),
        locked: Boolean(docById.get(r.entity_id)?.status && !EDITABLE.has(docById.get(r.entity_id)!.status)),
      })),
    [rows, docById],
  );
  const entityTypes = useMemo(() => new Map(rows.map((r) => [r.entity_id, r.entity_type])), [rows]);

  const inSection = useMemo(() => {
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    return all.filter((f) =>
      section === "mine" ? f.ownerId === me : section === "recent" ? Date.parse(f.updatedAt) >= since : true,
    );
  }, [all, section, me]);

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
    const sum = (key: string) =>
      all.filter((f) => f.scan === "clean" && category(f.contentType) === key).reduce((s, f) => s + (f.bytes ?? 0), 0);
    return [
      { key: "docs", label: tr("Tài liệu"), bytes: sum("docs"), className: "bg-bamboo-700" },
      { key: "images", label: tr("Hình ảnh"), bytes: sum("images"), className: "bg-bamboo-300" },
      { key: "other", label: tr("Khác"), bytes: sum("other"), className: "bg-gray-500" },
    ];
  }, [all]);

  const doc = folderId ? docById.get(folderId) : undefined;
  const folder = folderId
    ? (folders.find((f) => f.id === folderId) ??
      (doc && ENTITY_TYPE[doc.kind]
        ? {
            id: doc.id,
            name: `${doc.code} · ${doc.title}`,
            entityType: ENTITY_TYPE[doc.kind]!,
            to: doc.to,
            fileCount: 0,
            bytes: 0,
          }
        : null))
    : null;

  return {
    folders,
    files: folderId ? inSection.filter((f) => f.entityId === folderId) : inSection,
    folder,
    folderHint: doc ? `${DOC_KIND_LABEL[doc.kind]} · ${doc.statusLabel}` : undefined,
    folderStatus: doc?.status,
    storage,
    targets: docs.documents
      .filter((d) => ENTITY_TYPE[d.kind] && !["APPROVED", "REJECTED", "CANCELLED"].includes(d.status))
      .map((d) => ({ id: d.id, entityType: ENTITY_TYPE[d.kind]!, label: `${d.code} · ${d.title}` })),
    reload: () => void files.query.refetch(),
    loading: files.query.isLoading || docs.loading,
    error: files.query.error?.message ?? docs.error,
  };
};
