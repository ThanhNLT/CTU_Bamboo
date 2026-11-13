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
