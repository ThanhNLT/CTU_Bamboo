// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Modal, Select } from "antd";
import { useEffect, useState } from "react";

import { fetchLibrary } from "../../knowledge-library/api";
import type { LibraryDoc } from "../../knowledge-library/types";
import { processFromDocument, type FromDocumentResult } from "../api";
import { SAMPLE_REGULATION } from "../sample";
import type { DesignUnit } from "../types";
import { downloadText } from "../utils";

/** Dựng bản nháp sơ đồ BPMN từ một tài liệu đang hiệu lực trong thư viện tri thức. */
export const FromDocumentModal = ({
  open,
  units,
  onClose,
  onCreated,
}: {
  open: boolean;
  units: DesignUnit[];
  onClose: () => void;
  onCreated: (result: FromDocumentResult) => void;
}) => {
  const [docs, setDocs] = useState<LibraryDoc[]>();
  const [docId, setDocId] = useState<string>();
  const [unitId, setUnitId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<FromDocumentResult>();

  useEffect(() => {
    if (!open) return;
    setDone(undefined);
    setError(undefined);
    fetchLibrary()
      .then((r) => setDocs(r.docs))
      .catch((e: Error) => setError(e.message));
  }, [open]);

  const build = async () => {
    if (!docId) return;
    setBusy(true);
    setError(undefined);
    try {
      setDone(await processFromDocument(docId, unitId ?? units[0]?.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const errors = done?.issues.filter((i) => i.level === "error").length ?? 0;

  return (
    <Modal
      open={open}
      title="Dựng sơ đồ từ văn bản trong thư viện tri thức"
      okText={done ? "Mở sơ đồ" : "Đọc văn bản và dựng sơ đồ"}
      cancelText={done ? "Đóng" : "Hủy"}
      okButtonProps={{ loading: busy, disabled: done ? false : !docId }}
      onOk={() => (done ? onCreated(done) : void build())}
      onCancel={onClose}
      destroyOnHidden
      width={620}
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-body">
          Hệ thống đọc tài liệu đang hiệu lực (tệp đính kèm, chữ OCR, tóm tắt, mục lục) theo mẫu quy trình, rồi tự dựng
          sơ đồ BPMN có làn theo người thực hiện và đường nối không chồng nhau. Không dùng mô hình AI: chỗ nào không
          hiểu sẽ được báo lại.
        </p>
        {!done && (
          <>
            <label className="block text-[12px] font-medium text-body">
              Tài liệu nguồn
              <Select
                aria-label="Tài liệu nguồn"
                className="mt-1 w-full"
                showSearch
                optionFilterProp="label"
                loading={!docs && !error}
                value={docId}
                onChange={setDocId}
                placeholder="Chọn tài liệu trong thư viện tri thức"
                options={(docs ?? []).map((d) => ({ value: d.id, label: `${d.code} · ${d.title}` }))}
              />
            </label>
            {units.length > 1 && (
              <label className="block text-[12px] font-medium text-body">
                Đơn vị sở hữu quy trình
                <Select
                  aria-label="Đơn vị sở hữu quy trình"
                  className="mt-1 w-full"
                  showSearch
                  optionFilterProp="label"
                  value={unitId ?? units[0]?.id}
                  onChange={setUnitId}
                  options={units.map((u) => ({ value: u.id, label: u.name }))}
                />
              </label>
            )}
            <button
              type="button"
              className="self-start text-[12.5px] font-medium text-bamboo-700 underline"
              onClick={() => downloadText("quy-trinh-mau.txt", SAMPLE_REGULATION)}
            >
              Tải văn bản mẫu (cách ghi các bước)
            </button>
          </>
        )}
        {done && (
          <div className="flex flex-col gap-2">
            <Alert
              type={errors ? "warning" : "success"}
              showIcon
              message={`Đã dựng bản nháp “${done.name}” từ ${done.source}: ${done.steps} bước`}
              description={errors ? `Còn ${errors} lỗi cần sửa trước khi phát hành.` : "Sơ đồ đã qua kiểm tra, chưa có lỗi."}
            />
            {done.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="Chỗ cần xem lại"
                description={
                  <ul className="m-0 pl-4">
                    {done.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </div>
        )}
        {error && <Alert type="error" showIcon message={error} />}
      </div>
    </Modal>
  );
};
