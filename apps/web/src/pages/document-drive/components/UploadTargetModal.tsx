/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { Modal, Select } from "antd";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { tr } from "../../../i18n";

export type UploadTarget = { id: string; entityType: string; label: string };

export const UploadTargetModal = ({
  open,
  targets,
  onCancel,
  onUpload,
}: {
  open: boolean;
  targets: UploadTarget[];
  onCancel: () => void;
  onUpload: (target: UploadTarget, files: FileList) => void;
}) => {
  const [targetId, setTargetId] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const target = targets.find((t) => t.id === targetId);

  return (
    <Modal open={open} title={tr("Tải tệp vào chứng từ")} onCancel={onCancel} footer={null} destroyOnHidden>
      <p className="mb-3 text-[13px] text-body">
        {tr(
          "Mỗi tệp thuộc một chứng từ (đề nghị mua sắm, tiếp nhận nhân sự) và chỉ người xem được chứng từ đó mới thấy tệp.",
        )}
      </p>
      <Select
        className="w-full"
        showSearch
        optionFilterProp="label"
        placeholder={tr("Chọn chứng từ (gõ số hoặc tiêu đề)")}
        aria-label={tr("Chứng từ nhận tệp")}
        value={targetId}
        onChange={setTargetId}
        options={targets.map((t) => ({ value: t.id, label: t.label }))}
        notFoundContent={tr("Không có chứng từ chưa kết thúc")}
      />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          {tr("Hủy")}
        </button>
        <button
          type="button"
          className={target ? primaryButtonClass : `${secondaryButtonClass} cursor-not-allowed opacity-60`}
          disabled={!target}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" aria-hidden /> {tr(" Chọn tệp")}
        </button>
        <input
          ref={inputRef}
          type="file"
          aria-label={tr("Tệp tải lên")}
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.csv,.md"
          multiple
          hidden
          onChange={(e) => {
            if (target && e.target.files?.length) onUpload(target, e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </Modal>
  );
};
