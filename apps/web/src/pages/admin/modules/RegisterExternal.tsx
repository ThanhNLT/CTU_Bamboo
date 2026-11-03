// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App, Input, Modal, Typography } from "antd";
import { useState } from "react";

import { registerExternal } from "../../../modules/api";
import { showKey } from "./externalKey";

const TEMPLATE = `{
  "code": "x_nhac_viec",
  "name": "Nhắc việc",
  "description": "Gửi lời nhắc tới đồng nghiệp qua thông báo của Bamboo",
  "vendor": "Công ty phát triển",
  "version": "1.0.0",
  "base_url": "http://nhac-viec:8080",
  "entry_path": "/",
  "health_path": "/healthz",
  "depends": [],
  "scopes": ["people.read", "notify.send"],
  "menu": [{ "label": "Nhắc việc", "path": "/" }]
}`;

/** Đăng ký hoặc cập nhật mô-đun ngoài bằng manifest JSON (ADR #58). */
export const RegisterExternal = ({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) => {
  const { modal } = App.useApp();
  const [text, setText] = useState(TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    let manifest: unknown;
    try {
      manifest = JSON.parse(text);
    } catch {
      setError("Manifest không phải JSON hợp lệ");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const r = await registerExternal(manifest);
      onClose();
      await onDone();
      showKey(modal, r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Thêm hoặc cập nhật mô-đun ngoài"
      okText="Đăng ký"
      cancelText="Hủy"
      confirmLoading={busy}
      onOk={submit}
      onCancel={onClose}
      width={720}
    >
      <Typography.Paragraph type="secondary" className="text-[13px]">
        Mô-đun do bên khác viết chạy thành dịch vụ riêng, nối vào Bamboo qua cổng API. Dán manifest nhà phát triển cung
        cấp. Trùng mã thì cập nhật (giữ khóa); xin thêm phạm vi dữ liệu thì mô-đun bị tắt ở mọi công ty để quản trị công
        ty xem và đồng ý lại.
      </Typography.Paragraph>
      <Input.TextArea
        aria-label="Manifest"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoSize={{ minRows: 14, maxRows: 22 }}
        className="font-mono text-[12.5px]"
        spellCheck={false}
      />
      {error && <Alert type="error" showIcon message={error} className="mt-3" />}
    </Modal>
  );
};
