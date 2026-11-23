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

import { Alert, App, Modal, Steps, Table, Upload } from "antd";
import { Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import { useState } from "react";

import { smallSecondaryButtonClass } from "../../../components/ui";
import { AccountsResult } from "./AccountsResult";
import {
  createAccounts,
  downloadTemplate,
  importFile,
  type AccountResult,
  type ImportKind,
  type ImportResult,
} from "./api";
import { tr, trf } from "../../../i18n";

const ACCEPT = ".xlsx,.csv";

export const ImportModal = ({
  open,
  kind,
  label,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: ImportKind;
  label: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<AccountResult[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);

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
        message.error(tr("Dữ liệu đã thay đổi từ lúc xem trước: còn dòng lỗi, chưa ghi."));
        return;
      }
      message.success(trf("Đã nhập {0} dòng {1}.", [r.total, label]));
      onDone();
      if (!r.created.length) {
        close();
        return;
      }
      setFinished(true);
      setNames(Object.fromEntries(r.created.map((c) => [c.person_id, c.full_name])));
      try {
        setAccounts(
          await createAccounts(
            r.created.map((c) => ({ person_id: c.person_id, username: c.username, email: c.email })),
          ),
        );
      } catch (e) {
        const reason = (e as Error).message;
        message.warning(
          trf("Đã nhập {0} dòng nhưng chưa tạo được tài khoản đăng nhập", [r.total]) +
            (reason && reason !== "internal error" ? ` (${reason})` : tr(" (máy chủ đăng nhập chưa sẵn sàng)")) +
            tr(". Mở từng người ở danh sách và tạo tài khoản ở ngăn bên phải."),
          8,
        );
        close();
      }
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
        open={open && !finished}
        title={trf("Nhập {0} từ Excel", [label])}
        width={720}
        onCancel={close}
        okText={preview && !preview.errors.length ? trf("Ghi {0} dòng", [preview.total]) : "Ghi"}
        okButtonProps={{ disabled: !preview || preview.errors.length > 0 || preview.total === 0 }}
        cancelText={tr("Đóng")}
        confirmLoading={busy && Boolean(preview)}
        onOk={() => void apply()}
        destroyOnHidden
      >
        <Steps
          size="small"
          className="my-4"
          current={step}
          items={[{ title: tr("Tải tệp mẫu") }, { title: tr("Chọn tệp") }, { title: tr("Xem trước và ghi") }]}
        />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-bamboo-700" strokeWidth={1.75} aria-hidden />
          <p className="m-0 min-w-0 flex-1 text-[12.5px] text-body">
            {tr(
              "Dùng tệp mẫu (cột có dấu * là bắt buộc; dòng 2 là ví dụ, xóa trước khi nhập). Nhận .xlsx hoặc .csv UTF-8, tối đa 2 MB / 5000 dòng. Mã đã có thì cập nhật, chưa có thì thêm mới.",
            )}
          </p>
          <button
            type="button"
            className={smallSecondaryButtonClass}
            onClick={() => void downloadTemplate(kind).catch((e: Error) => message.error(e.message))}
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> {tr(" Tải tệp mẫu")}
          </button>
        </div>

        <Upload.Dragger
          className="mt-3 block"
          accept={ACCEPT}
          showUploadList={false}
          disabled={busy}
          customRequest={({ file: f }) => void check(f as File)}
        >
          <p className="m-0 text-[13px] font-medium text-ink">
            {file ? file.name : tr("Kéo thả hoặc bấm để chọn tệp")}
          </p>
          <p className="m-0 mt-1 text-[12px] text-muted">
            {busy && !preview
              ? tr("Đang kiểm tra trên máy chủ…")
              : tr("Máy chủ chạy thử toàn bộ rồi hoàn tác — chưa ghi gì.")}
          </p>
        </Upload.Dragger>

        {preview && (
          <div className="mt-4">
            {preview.errors.length === 0 ? (
              <Alert type="success" showIcon message={trf("{0} dòng hợp lệ — sẵn sàng ghi.", [preview.total])} />
            ) : (
              <>
                <Alert
                  type="error"
                  showIcon
                  message={trf("{0} / {1} dòng có lỗi — sửa tệp rồi chọn lại.", [preview.errors.length, preview.total])}
                  description={tr("Chỉ ghi khi mọi dòng hợp lệ, để không nhập dở dang.")}
                  action={
                    <button type="button" className={smallSecondaryButtonClass} onClick={reset}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {tr(" Chọn tệp khác")}
                    </button>
                  }
                />
                <Table
                  className="mt-3"
                  size="small"
                  rowKey={(e) => `${e.row}:${e.message}`}
                  dataSource={preview.errors}
                  pagination={preview.errors.length > 8 ? { pageSize: 8, size: "small" } : false}
                  columns={[
                    {
                      title: tr("Dòng"),
                      dataIndex: "row",
                      width: 70,
                      render: (v: number) => <span className="tabular-nums">{v}</span>,
                    },
                    { title: tr("Lỗi"), dataIndex: "message" },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>
      <AccountsResult
        results={accounts}
        names={names}
        onClose={() => {
          setAccounts(null);
          close();
        }}
      />
    </>
  );
};
