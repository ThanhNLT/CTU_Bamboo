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

import { Typography } from "antd";

import type { ExtRegistered } from "../../../modules/api";
import { tr } from "../../../i18n";

export const KeyNotice = ({ r }: { r: ExtRegistered }) => (
  <div className="space-y-2 text-[13px]">
    {r.api_key && (
      <>
        <p className="m-0">
          {tr("Khóa chỉ hiện một lần. Đặt vào cấu hình dịch vụ của mô-đun (ví dụ biến MODULE_KEY):")}
        </p>
        <Typography.Text code copyable className="break-all">
          {r.api_key}
        </Typography.Text>
      </>
    )}
    <p className="m-0 text-muted">{r.message}</p>
    {!r.reachable && (
      <p className="m-0">{tr("Dịch vụ của mô-đun chưa trả lời; kiểm tra base_url và mạng giữa hai bên.")}</p>
    )}
  </div>
);
