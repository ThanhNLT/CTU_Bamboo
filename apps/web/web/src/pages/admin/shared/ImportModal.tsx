// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nhập hàng loạt từ Excel / CSV (ADR #44): tải tệp mẫu → chọn tệp → máy chủ chạy thử trong giao dịch rồi hoàn tác
// (xem trước lỗi từng dòng, do chính CSDL kiểm tra) → ghi khi mọi dòng hợp lệ. Nhập nhân sự có cột tên đăng nhập
// thì tạo tài khoản ngay sau khi ghi.
import { Alert, App, Modal, Steps, Table, Upload } from "antd";
import { Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import { useState } from "react";
import { smallSecondaryButtonClass } from "../../../components/ui";
import { AccountsResult } from "./AccountsResult";
import { createAccounts, downloadTemplate, importFile, type AccountResult, type ImportKind, type ImportResult } from "./api";

const ACCEPT = ".xlsx,.csv";

export const ImportModal = ({
  open, kind, label, onClose, onDone,
}: {
  open: boolean;
  kind: ImportKind;
  /** "đơn vị", "nhân sự"... */
  label: string;
  onClose: () => void;
  /** Sau khi đã ghi (để trang tải lại). */
  onDone: () => void;
}) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<AccountResult[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const reset = () => {
    setFile(undefined);
    setPreview(undefined);
  };
  const close = () => {
    reset();
    onClose();
  };

  const check = async (f: File) => {
    setFile(f);
    setPreview(undefined);
    setBusy(true);
    try {
      setPreview(await importFile(kind, f, true));
    } catch (e) {
      message.error((e as Error).message);
      setFile(undefined);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await importFile(kind, file, false);
      if (!r.applied) {
        setPreview(r);
        message.error("Dữ liệu đã thay đổi từ lúc xem trước: còn dòng lỗi, chưa ghi.");
        return;
      }
      message.success(`Đã nhập ${r.total} dòng ${label}.`);
      onDone();
      if (r.created.length) {
        setNames(Object.fromEntries(r.created.map((c) => [c.person_id, c.full_name])));
        setAccounts(await createAccounts(r.created.map((c) => ({ person_id: c.person_id, username: c.username, email: c.email }))));
      }
      close();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const step = preview ? 2 : 1;

  return (
    <>
      <Modal
        open={open}
        title={`Nhập ${label} từ Excel`}
        width={720}
        onCancel={close}
        okText={preview && !preview.errors.length ? `Ghi ${preview.total} dòng` : "Ghi"}
        okButtonProps={{ disabled: !preview || preview.errors.length > 0 || preview.total === 0 }}
        cancelText="Đóng"
        confirmLoading={busy && Boolean(preview)}
        onOk={() => void apply()}
        destroyOnHidden
      >
        <Steps
          size="small"
          className="my-4"
          current={step}
          items={[{ title: "Tải tệp mẫu" }, { title: "Chọn tệp" }, { title: "Xem trước và ghi" }]}
        />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-bamboo-700" strokeWidth={1.75} aria-hidden />
          <p className="m-0 min-w-0 flex-1 text-[12.5px] text-body">
            Dùng tệp mẫu (cột có dấu * là bắt buộc; dòng 2 là ví dụ, xóa trước khi nhập). Nhận .xlsx hoặc .csv UTF-8,
            tối đa 2 MB / 5000 dòng. Mã đã có thì cập nhật, chưa có thì thêm mới.
          </p>
          <button type="button" className={smallSecondaryButtonClass}
                  onClick={() => void downloadTemplate(kind).catch((e: Error) => message.error(e.message))}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Tải tệp mẫu
          </button>
        </div>

        <Upload.Dragger
          className="mt-3 block"
          accept={ACCEPT}
          showUploadList={false}
          disabled={busy}
          customRequest={({ file: f }) => void check(f as File)}
        >
          <p className="m-0 text-[13px] font-medium text-ink">{file ? file.name : "Kéo thả hoặc bấm để chọn tệp"}</p>
          <p className="m-0 mt-1 text-[12px] text-muted">
            {busy && !preview ? "Đang kiểm tra trên máy chủ…" : "Máy chủ chạy thử toàn bộ rồi hoàn tác — chưa ghi gì."}
          </p>
        </Upload.Dragger>

        {preview && (
          <div className="mt-4">
            {preview.errors.length === 0 ? (
              <Alert type="success" showIcon message={`${preview.total} dòng hợp lệ — sẵn sàng ghi.`} />
            ) : (
              <>
                <Alert
                  type="error"
                  showIcon
                  message={`${preview.errors.length} / ${preview.total} dòng có lỗi — sửa tệp rồi chọn lại.`}
                  description="Chỉ ghi khi mọi dòng hợp lệ, để không nhập dở dang."
                  action={(
                    <button type="button" className={smallSecondaryButtonClass} onClick={reset}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Chọn tệp khác
                    </button>
                  )}
                />
                <Table
                  className="mt-3"
                  size="small"
                  rowKey={(e) => `${e.row}:${e.message}`}
                  dataSource={preview.errors}
                  pagination={preview.errors.length > 8 ? { pageSize: 8, size: "small" } : false}
                  columns={[
                    { title: "Dòng", dataIndex: "row", width: 70, render: (v: number) => <span className="tabular-nums">{v}</span> },
                    { title: "Lỗi", dataIndex: "message" },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>
      <AccountsResult results={accounts} names={names} onClose={() => setAccounts(null)} />
    </>
  );
};
