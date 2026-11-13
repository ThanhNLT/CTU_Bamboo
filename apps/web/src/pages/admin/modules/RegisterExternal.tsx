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

import { Alert, App, Input, Modal, Typography } from "antd";
import { useState } from "react";

import { registerExternal } from "../../../modules/api";
import { showKey } from "./externalKey";
import { tr } from "../../../i18n";

const TEMPLATE = tr(
  '{\n  "code": "x_nhac_viec",\n  "name": "Nhắc việc",\n  "description": "Gửi lời nhắc tới đồng nghiệp qua thông báo của Bamboo",\n  "vendor": "Công ty phát triển",\n  "version": "1.0.0",\n  "base_url": "http://nhac-viec:8080",\n  "entry_path": "/",\n  "health_path": "/healthz",\n  "depends": [],\n  "scopes": ["people.read", "notify.send"],\n  "menu": [{ "label": "Nhắc việc", "path": "/" }]\n}',
);

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
      setError(tr("Manifest không phải JSON hợp lệ"));
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
      title={tr("Thêm hoặc cập nhật mô-đun ngoài")}
      okText={tr("Đăng ký")}
      cancelText={tr("Hủy")}
      confirmLoading={busy}
      onOk={submit}
      onCancel={onClose}
      width={720}
    >
      <Typography.Paragraph type="secondary" className="text-[13px]">
        {tr(
          "Mô-đun do bên khác viết chạy thành dịch vụ riêng, nối vào Bamboo qua cổng API. Dán manifest nhà phát triển cung cấp. Trùng mã thì cập nhật (giữ khóa); xin thêm phạm vi dữ liệu thì mô-đun bị tắt ở mọi công ty để quản trị công ty xem và đồng ý lại.",
        )}
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
