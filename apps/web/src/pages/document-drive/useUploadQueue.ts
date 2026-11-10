/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useCallback, useState } from "react";

import { request } from "../../api/client";
import { uploadContentType } from "../../utils/fileType";
import type { UploadItem } from "./types";
import { tr, trf } from "../../i18n";

const MAX_BYTES = 25 * 1024 * 1024;

type Target = { entityType: string; entityId: string };

const put = (url: string, file: File, contentType: string, onProgress: (pct: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error(trf("Tải lên kho lưu trữ thất bại ({0})", [xhr.status])));
    xhr.onerror = () => reject(new Error(tr("Mất kết nối khi tải lên")));
    xhr.send(file);
  });

export const useUploadQueue = () => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const patch = (id: string, p: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const uploadOne = useCallback(async (id: string, file: File, target: Target) => {
    try {
      if (file.size > MAX_BYTES) throw new Error(tr("Tệp phải nhỏ hơn 25 MB"));
      const { get_upload_url: t } = await request<{
        get_upload_url: { attachment_id: string; upload_url: string; content_type: string };
      }>(
        `mutation Up($entity: String!, $id: uuid!, $name: String!, $type: String!, $size: Int!) {
           get_upload_url(entity_type: $entity, entity_id: $id, file_name: $name, content_type: $type, size_bytes: $size) {
             attachment_id upload_url content_type } }`,
        {
          entity: target.entityType,
          id: target.entityId,
          name: file.name,
          type: uploadContentType(file),
          size: file.size,
        },
      );
      await put(t.upload_url, file, t.content_type, (progress) => patch(id, { progress }));
      patch(id, { progress: 100, status: "scanning" });
      const { confirm_upload: r } = await request<{ confirm_upload: { status: string; scan_result: string | null } }>(
        `mutation Confirm($a: uuid!) { confirm_upload(attachment_id: $a) { status scan_result } }`,
        { a: t.attachment_id },
      );
      patch(id, r.status === "CLEAN" ? { status: "clean" } : { status: "blocked", error: r.scan_result ?? r.status });
    } catch (e) {
      patch(id, { status: "blocked", error: (e as Error).message });
    }
  }, []);

  const enqueue = useCallback(
    (files: FileList | File[], target: Target) => {
      const stamp = Date.now();
      const added = Array.from(files).map((file, i) => ({
        file,
        item: { id: `${stamp}-${i}-${file.name}`, name: file.name, progress: 0, status: "uploading" as const },
      }));
      setItems((prev) => [...prev, ...added.map((a) => a.item)]);
      for (const a of added) void uploadOne(a.item.id, a.file, target);
    },
    [uploadOne],
  );

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "uploading" || i.status === "scanning"));
  }, []);

  return { items, enqueue, clearFinished };
};
