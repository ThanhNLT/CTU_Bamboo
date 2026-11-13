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

import dayjs from "dayjs";

import { cn } from "../utils/cn";
import { tr, trf } from "../i18n";

export const LiveBadge = ({ connected, changedAt }: { connected: boolean; changedAt?: Date }) => (
  <span
    role="status"
    className={cn(
      "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium",
      connected ? "bg-bamboo-50 text-bamboo-800" : "bg-black/[0.04] text-muted",
    )}
    title={
      connected
        ? tr("Số liệu tự cập nhật ngay khi có thay đổi từ bất kỳ tài khoản, thiết bị nào")
        : tr("Mất kết nối thời gian thực, số liệu vẫn tự tải lại mỗi phút")
    }
  >
    <span className="relative flex h-2 w-2" aria-hidden>
      {connected && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-bamboo-400 opacity-60 motion-safe:animate-ping" />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", connected ? "bg-bamboo-500" : "bg-gray-400")} />
    </span>
    {connected ? tr("Trực tiếp") : tr("Đang kết nối lại")}
    {connected && changedAt && (
      <span className="text-bamboo-700">· {trf("đổi lúc {0}", [dayjs(changedAt).format("HH:mm:ss")])}</span>
    )}
  </span>
);
