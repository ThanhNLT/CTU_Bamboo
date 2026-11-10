/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import dayjs from "dayjs";

import { cn } from "../utils/cn";
import { tr, trf } from "../i18n";

/** Nhãn "Trực tiếp": chấm xanh khi đang nhận tín hiệu thay đổi, kèm giờ thay đổi gần nhất. */
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
