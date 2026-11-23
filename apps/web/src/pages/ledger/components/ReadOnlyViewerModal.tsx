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

import { Modal, Spin } from "antd";
import { FileWarning, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import type { ArchiveView } from "../types";
import { READING_ROOM_RULES } from "../utils";
import { tr, trf } from "../../../i18n";

const escXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);

const watermarkUrl = (text: string) => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='190'>` +
    `<text x='170' y='100' text-anchor='middle' transform='rotate(-24 170 95)' fill='rgba(27,35,30,0.13)' ` +
    `font-size='13' font-family='Inter, Segoe UI, Arial, sans-serif'>${escXml(text)}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
};

const TextBody = ({ url }: { url: string }) => {
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => alive && setText(t))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url]);
  if (failed) return <p className="text-[13px] text-red-700">{tr("Không tải được nội dung tệp. Đóng và mở lại.")}</p>;
  if (text === undefined) return <Spin />;
  return (
    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-ink">{text}</pre>
  );
};

const Body = ({ view }: { view: ArchiveView }) => {
  if (view.contentType === "application/pdf") {
    return (
      <iframe
        title={trf("Xem chỉ đọc: {0}", [view.fileName])}
        src={`${view.url}#toolbar=0&navpanes=0`}
        className="h-[70vh] w-full rounded-md border-0 bg-surface"
      />
    );
  }
  if (view.contentType.startsWith("image/")) {
    return (
      <img
        src={view.url}
        alt={view.fileName}
        draggable={false}
        className="mx-auto max-h-[70vh] rounded-md bg-surface"
      />
    );
  }
  if (view.contentType === "text/plain") {
    return (
      <article className="max-h-[70vh] overflow-auto rounded-md bg-surface px-6 py-5 shadow-card">
        <TextBody url={view.url} />
      </article>
    );
  }
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-md bg-surface text-center">
      <FileWarning className="h-6 w-6 text-amber-600" aria-hidden />
      <p className="m-0 text-[13px] text-body">
        {tr("Tệp ")} <b>{view.fileName}</b> {tr(" (Word, Excel) không xem trực tiếp được trong phòng đọc.")}
      </p>
      <p className="m-0 text-[12px] text-muted">{tr("Mở chứng từ gốc nếu bạn cần tải tệp về.")}</p>
    </div>
  );
};

export const ReadOnlyViewerModal = ({ view, onClose }: { view?: ArchiveView; onClose: () => void }) => (
  <Modal
    open={view != null}
    onCancel={onClose}
    footer={null}
    width={880}
    destroyOnHidden
    title={
      <span className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted" aria-hidden />
        <span className="truncate">{view?.title}</span>
        <span className="inline-flex h-5 shrink-0 items-center rounded-ui border border-line px-2 text-[11px] font-medium text-body">
          {tr("Chỉ đọc")}
        </span>
      </span>
    }
  >
    {view && (
      <div>
        <div
          className="relative select-none overflow-hidden rounded-xl bg-canvas p-3 sm:p-4"
          onContextMenu={(e) => e.preventDefault()}
          onCopy={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          <Body view={view} />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: watermarkUrl(trf("{0} · {1} · CHỈ ĐỌC", [view.viewer, view.openedAt])) }}
            aria-hidden
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-muted">
          <span>{READING_ROOM_RULES}</span>
          <span className="font-mono">{view.fileName}</span>
        </div>
      </div>
    )}
  </Modal>
);
