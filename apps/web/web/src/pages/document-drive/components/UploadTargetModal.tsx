// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Modal, Select } from "antd";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";

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
    <Modal open={open} title="Tải tệp vào chứng từ" onCancel={onCancel} footer={null} destroyOnHidden>
      <p className="mb-3 text-[13px] text-body">
        Mỗi tệp thuộc một chứng từ (đề nghị mua sắm, tiếp nhận nhân sự) và chỉ người xem được chứng từ đó mới thấy tệp.
      </p>
      <Select
        className="w-full"
        showSearch
        optionFilterProp="label"
        placeholder="Chọn chứng từ (gõ số hoặc tiêu đề)"
        aria-label="Chứng từ nhận tệp"
        value={targetId}
        onChange={setTargetId}
        options={targets.map((t) => ({ value: t.id, label: t.label }))}
        notFoundContent="Không có chứng từ chưa kết thúc"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className={target ? primaryButtonClass : `${secondaryButtonClass} cursor-not-allowed opacity-60`}
          disabled={!target}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" aria-hidden /> Chọn tệp
        </button>
        <input
          ref={inputRef}
          type="file"
          aria-label="Tệp tải lên"
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
