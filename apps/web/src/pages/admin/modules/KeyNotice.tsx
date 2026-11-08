import { Typography } from "antd";

import type { ExtRegistered } from "../../../modules/api";
import { tr } from "../../../i18n";

/** Nội dung hộp thoại khóa mô-đun (khóa chỉ hiện một lần). */
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
