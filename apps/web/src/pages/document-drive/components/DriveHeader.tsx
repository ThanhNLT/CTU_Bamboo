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

import { Tooltip } from "antd";
import { Upload } from "lucide-react";
import { useRef } from "react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { tr } from "../../../i18n";

export const DriveHeader = ({
  onUpload,
  onPickTarget,
  uploadDisabledReason,
}: {
  onUpload: (files: FileList) => void;
  onPickTarget?: () => void;
  uploadDisabledReason?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Ổ đĩa tài liệu")}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {tr("Tệp đính kèm của các chứng từ bạn được xem · mọi tệp được kiểm dịch (ClamAV) trước khi lưu")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Tooltip title={uploadDisabledReason}>
          <button
            type="button"
            onClick={() => (onPickTarget ? onPickTarget() : inputRef.current?.click())}
            disabled={Boolean(uploadDisabledReason)}
            className={
              uploadDisabledReason ? `${secondaryButtonClass} cursor-not-allowed opacity-60` : primaryButtonClass
            }
          >
            <Upload className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            {tr("Tải lên")}
          </button>
        </Tooltip>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.csv,.md"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
};
