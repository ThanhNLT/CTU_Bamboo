import type { App } from "antd";
import { createElement } from "react";

import { rotateExternalKey, type ExtRegistered } from "../../../modules/api";
import { KeyNotice } from "./KeyNotice";
import { tr, trf } from "../../../i18n";

type ModalApi = ReturnType<typeof App.useApp>["modal"];

/** Khóa mô-đun chỉ hiện một lần: người đăng ký chép vào cấu hình dịch vụ của mô-đun (biến MODULE_KEY). */
export const showKey = (modal: ModalApi, r: ExtRegistered) =>
  modal[r.reachable ? "success" : "warning"]({
    title: r.updated && !r.api_key ? trf("Đã cập nhật mô-đun {0}", [r.code]) : trf("Khóa của mô-đun {0}", [r.code]),
    width: 620,
    content: createElement(KeyNotice, { r }),
  });

export const rotateKey = (modal: ModalApi, code: string, onDone: () => Promise<void> | void) =>
  modal.confirm({
    title: trf("Đổi khóa mô-đun {0}?", [code]),
    content: tr("Khóa cũ hết hiệu lực ngay; mô-đun ngừng gọi được Bamboo cho tới khi cập nhật khóa mới."),
    okText: tr("Đổi khóa"),
    okButtonProps: { danger: true },
    cancelText: tr("Hủy"),
    onOk: async () => {
      showKey(modal, await rotateExternalKey(code));
      await onDone();
    },
  });
