// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { App } from "antd";
import { createElement } from "react";

import { rotateExternalKey, type ExtRegistered } from "../../../modules/api";
import { KeyNotice } from "./KeyNotice";

type ModalApi = ReturnType<typeof App.useApp>["modal"];

/** Khóa mô-đun chỉ hiện một lần: người đăng ký chép vào cấu hình dịch vụ của mô-đun (biến MODULE_KEY). */
export const showKey = (modal: ModalApi, r: ExtRegistered) =>
  modal[r.reachable ? "success" : "warning"]({
    title: r.updated && !r.api_key ? `Đã cập nhật mô-đun ${r.code}` : `Khóa của mô-đun ${r.code}`,
    width: 620,
    content: createElement(KeyNotice, { r }),
  });

export const rotateKey = (modal: ModalApi, code: string, onDone: () => Promise<void> | void) =>
  modal.confirm({
    title: `Đổi khóa mô-đun ${code}?`,
    content: "Khóa cũ hết hiệu lực ngay; mô-đun ngừng gọi được Bamboo cho tới khi cập nhật khóa mới.",
    okText: "Đổi khóa",
    okButtonProps: { danger: true },
    cancelText: "Hủy",
    onOk: async () => {
      showKey(modal, await rotateExternalKey(code));
      await onDone();
    },
  });
