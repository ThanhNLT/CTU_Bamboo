// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Spin } from "antd";
import { useCallback, useEffect, useState } from "react";

import { request } from "../../../api/client";
import { Attachments } from "../../../components/document/Attachments";
import type { Attachment } from "../../../components/document/types";
import { tr } from "../../../i18n";

const ENTITY = "pm.project";
const FILES = `query ProjectFiles($id: uuid!) {
  core_attachment(where: {entity_type: {_eq: "pm.project"}, entity_id: {_eq: $id}}, order_by: {created_at: asc}) {
    id file_name content_type size_bytes status scan_result scan_engines created_at uploaded_by
    uploaded_by_person { full_name } ocr { status pages_total pages_done note error }
  }
}`;

/** Tệp của dự án (ADR #71): nằm trong nhóm Dự án của Ổ đĩa, chuyển sang Lưu trữ khi dự án hoàn thành hoặc hủy. */
export const ProjectFiles = ({
  projectId,
  closed,
  me,
  onCount,
}: {
  projectId: string;
  closed: boolean;
  me: string;
  onCount?: (n: number) => void;
}) => {
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { core_attachment } = await request<{ core_attachment: Attachment[] }>(FILES, { id: projectId });
      setFiles(core_attachment);
      onCount?.(core_attachment.length);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={tr("Không tải được tệp")} description={error} />;
  if (!files) return <Spin className="m-6 block" />;
  return (
    <section className="rounded-2xl border bg-surface p-4 shadow-card">
      <Attachments
        doc={{ id: projectId, status: closed ? "CANCELLED" : "ACTIVE", attachments: files }}
        entityType={ENTITY}
        me={me}
        canUpload={!closed}
        onChange={() => void load()}
        hint={tr("kế hoạch, biên bản, sản phẩm bàn giao")}
      />
    </section>
  );
};
