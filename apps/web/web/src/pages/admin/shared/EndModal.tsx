// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { DatePicker, Modal, Radio } from "antd"; // Ant Design
import type { Dayjs } from "dayjs"; // Day.js
import { useState } from "react"; // React

// ===== Module nội bộ =====
import { MODAL_Z } from "./zIndex";

// ===== Component =====
/**
 * Xác nhận kết thúc hiệu lực (ngừng đơn vị / vị trí, kết thúc bổ nhiệm, thu hồi quyền): ngay bây giờ hoặc hết một
 * ngày chọn trước. Không xóa — lịch sử vẫn còn cho chuỗi duyệt và nhật ký kiểm toán.
 */
export const EndModal = ({
  open,
  title,
  description,
  okText,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  okText: string;
  onCancel: () => void;
  onConfirm: (endDate: Dayjs | null) => Promise<void>;
}) => {
  const [mode, setMode] = useState<"now" | "date">("now");
  const [date, setDate] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger: true, disabled: mode === "date" && !date }}
      cancelText="Hủy"
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={async () => {
        setBusy(true);
        try {
          await onConfirm(mode === "date" ? date : null);
        } finally {
          setBusy(false);
        }
      }}
      destroyOnHidden
      zIndex={MODAL_Z}
    >
      <p className="text-[13px] text-body">{description}</p>
      <Radio.Group className="mt-2 flex flex-col gap-2" value={mode} onChange={(e) => setMode(e.target.value)}>
        <Radio value="now">Ngay bây giờ</Radio>
        <Radio value="date">
          <span className="inline-flex flex-wrap items-center gap-2">
            Hết ngày
            <DatePicker
              size="small"
              format="DD/MM/YYYY"
              value={date}
              onChange={(d) => {
                setDate(d);
                setMode("date");
              }}
            />
          </span>
        </Radio>
      </Radio.Group>
      <p className="mt-3 text-[12px] text-muted">
        Không xóa dữ liệu: lịch sử vẫn giữ cho chuỗi duyệt và nhật ký kiểm toán.
      </p>
    </Modal>
  );
};
