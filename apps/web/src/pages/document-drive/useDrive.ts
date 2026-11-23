/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { useList } from "@refinedev/core";
import gql from "graphql-tag";
import { useEffect, useMemo, useState } from "react";

import { request } from "../../api/client";
import { DOC_KIND_LABEL, useDocuments, type DocKind } from "../../api/documents";
import { useModules } from "../../modules/useModules";
import { formatAgo } from "../../utils/format";
import { PARA_NAV } from "./nav";
import type { DriveFile, DriveFolder, DriveSection, ParaGroup, ScanResult, StorageSegment } from "./types";
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
      para
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
  para: ParaGroup | null;
  uploaded_by: string;
  uploaded_by_person: { full_name: string } | null;
};

type ExtraFolder = { id: string; name: string; entityType: string; to: string; open: boolean; hint: string };

const PARA_KEYS = new Set<string>(PARA_NAV.map((n) => n.key));
const PROJECT_DONE = new Set(["DONE", "CANCELLED"]);

const useExtraFolders = () => {
  const modules = useModules();
  const withProjects = modules.ready && modules.enabled("project");
  const [extra, setExtra] = useState<ExtraFolder[]>([]);
  useEffect(() => {
    if (!modules.ready) return;
    let alive = true;
    const load = async () => {
      const out: ExtraFolder[] = [];
      const chats = await request<{ chat_conversation: { id: string; display_name: string | null }[] }>(
        `query DriveChats { chat_conversation(limit: 500) { id display_name } }`,
      ).catch(() => ({ chat_conversation: [] }));
      for (const c of chats.chat_conversation)
        out.push({
          id: c.id,
          name: c.display_name ?? tr("Cuộc trò chuyện"),
          entityType: "chat.conversation",
          to: `/h/chat/${c.id}`,
          open: false,
          hint: tr("Tin nhắn"),
        });
      if (withProjects) {
        const projects = await request<{ pm_project: { id: string; code: string; name: string; status: string }[] }>(
          `query DriveProjects { pm_project(limit: 500) { id code name status } }`,
        ).catch(() => ({ pm_project: [] }));
        for (const p of projects.pm_project)
          out.push({
            id: p.id,
            name: `${p.code} · ${p.name}`,
            entityType: "pm.project",
            to: `/p/projects/${p.id}`,
            open: !PROJECT_DONE.has(p.status),
            hint: tr("Dự án"),
          });
      }
      if (alive) setExtra(out);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [modules.ready, withProjects]);
  return extra;
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
  const extra = useExtraFolders();
  const extraById = useMemo(() => new Map(extra.map((e) => [e.id, e])), [extra]);

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
        para: r.para ?? "RESOURCES",
      })),
    [rows, docById],
  );
  const entityTypes = useMemo(() => new Map(rows.map((r) => [r.entity_id, r.entity_type])), [rows]);

  const inSection = useMemo(() => {
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    return all.filter((f) =>
      section === "mine"
        ? f.ownerId === me
        : section === "recent"
          ? Date.parse(f.updatedAt) >= since
          : PARA_KEYS.has(section)
            ? f.para === section
            : true,
    );
  }, [all, section, me]);

  const paraCounts = useMemo(() => {
    const counts: Record<ParaGroup, number> = { PROJECTS: 0, AREAS: 0, RESOURCES: 0, ARCHIVES: 0 };
    for (const f of all) counts[f.para] += 1;
    return counts;
  }, [all]);

  const folders = useMemo(() => {
    const byDoc = new Map<string, DriveFolder>();
    for (const f of inSection) {
      const d = docById.get(f.entityId);
      const e = extraById.get(f.entityId);
      const folder = byDoc.get(f.entityId) ?? {
        id: f.entityId,
        name: d ? `${d.code} · ${d.title}` : (e?.name ?? f.entityId),
        entityType: entityTypes.get(f.entityId) ?? "",
        to: d?.to ?? e?.to,
        fileCount: 0,
        bytes: 0,
        para: f.para,
      };
      folder.fileCount += 1;
      folder.bytes += f.bytes ?? 0;
      byDoc.set(f.entityId, folder);
    }
    return [...byDoc.values()];
  }, [inSection, docById, entityTypes, extraById]);

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
  const extraFolder = folderId ? extraById.get(folderId) : undefined;
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
        : extraFolder
          ? { ...extraFolder, fileCount: 0, bytes: 0 }
          : null))
    : null;

  return {
    folders,
    files: folderId ? inSection.filter((f) => f.entityId === folderId) : inSection,
    folder,
    folderHint: doc ? `${DOC_KIND_LABEL[doc.kind]} · ${doc.statusLabel}` : extraFolder?.hint,
    folderStatus: doc?.status,
    storage,
    paraCounts,
    targets: [
      ...docs.documents
        .filter((d) => ENTITY_TYPE[d.kind] && !["APPROVED", "REJECTED", "CANCELLED"].includes(d.status))
        .map((d) => ({ id: d.id, entityType: ENTITY_TYPE[d.kind]!, label: `${d.code} · ${d.title}` })),
      ...extra
        .filter((e) => e.entityType === "pm.project" && e.open)
        .map((e) => ({ id: e.id, entityType: e.entityType, label: `${tr("Dự án")} ${e.name}` })),
    ],
    reload: () => void files.query.refetch(),
    loading: files.query.isLoading || docs.loading,
    error: files.query.error?.message ?? docs.error,
  };
};
