/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import type { App } from "antd";
import { createElement } from "react";

import { rotateExternalKey, type ExtRegistered } from "../../../modules/api";
import { KeyNotice } from "./KeyNotice";
import { tr, trf } from "../../../i18n";

type ModalApi = ReturnType<typeof App.useApp>["modal"];

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
