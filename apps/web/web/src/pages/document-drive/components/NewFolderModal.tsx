// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Input, Modal } from "antd";
import { useState } from "react";

/** Hộp thoại đặt tên thư mục mới. */
export const NewFolderModal = ({
  open, existing, onCancel, onCreate,
}: {
  open: boolean;
  existing: string[];
  onCancel: () => void;
  onCreate: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const duplicate = existing.some((n) => n.localeCompare(trimmed, "vi", { sensitivity: "base" }) === 0);
  const invalid = !trimmed || duplicate || /[\\/:*?"<>|]/.test(trimmed);

  const submit = () => {
    if (invalid) return;
    onCreate(trimmed);
    setName("");
  };

  return (
    <Modal
      title="Thư mục mới"
      open={open}
      okText="Tạo"
      cancelText="Hủy"
      okButtonProps={{ disabled: invalid }}
      onOk={submit}
      onCancel={() => {
        setName("");
        onCancel();
      }}
    >
      <Input
        autoFocus
        placeholder="Tên thư mục"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={submit}
        status={duplicate ? "error" : undefined}
      />
      {duplicate && <p className="mt-1.5 text-[12px] text-red-600">Đã có thư mục cùng tên.</p>}
    </Modal>
  );
};
