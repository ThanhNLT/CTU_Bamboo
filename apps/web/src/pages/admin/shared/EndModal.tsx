// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { DatePicker, Modal, Radio } from "antd";
import type { Dayjs } from "dayjs";
import { useState } from "react";

import { MODAL_Z } from "./zIndex";
import { tr } from "../../../i18n";

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
      cancelText={tr("Hủy")}
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
        <Radio value="now">{tr("Ngay bây giờ")}</Radio>
        <Radio value="date">
          <span className="inline-flex flex-wrap items-center gap-2">
            {tr("Hết ngày")}
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
        {tr("Không xóa dữ liệu: lịch sử vẫn giữ cho chuỗi duyệt và nhật ký kiểm toán.")}
      </p>
    </Modal>
  );
};
