// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Input, Modal, Tag } from "antd";
import { useState } from "react";

import { secondaryButtonClass } from "../../../components/ui";
import type { ChangeRequest } from "../types";

const STATUS = {
  OPEN: { color: "orange", label: "Đang chờ" },
  RESOLVED: { color: "green", label: "Đã xử lý" },
  DECLINED: { color: "default", label: "Đã từ chối" },
} as const;

export const ChangeRequestsTab = ({
  requests,
  canResolve,
  onResolve,
}: {
  requests: ChangeRequest[];
  canResolve: boolean;
  onResolve: (id: string, outcome: "RESOLVED" | "DECLINED", note: string) => Promise<void>;
}) => {
  const [target, setTarget] = useState<{ id: string; outcome: "RESOLVED" | "DECLINED" }>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await onResolve(target.id, target.outcome, note);
      setTarget(undefined);
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-label="Yêu cầu sửa chữa">
      <h2 className="m-0 text-[14px] font-semibold text-ink">
        {canResolve ? "Yêu cầu sửa chữa từ người giám sát" : "Yêu cầu sửa chữa của bạn"}
      </h2>
      {requests.length === 0 && <p className="m-0 mt-2 text-[12.5px] text-muted">Chưa có yêu cầu nào.</p>}
      <ul className="m-0 mt-3 list-none space-y-3 p-0">
        {requests.map((r) => (
          <li key={r.id} className="rounded-xl border border-line/80 p-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={STATUS[r.status].color}>{STATUS[r.status].label}</Tag>
              <span className="text-muted">
                {r.requestedBy} · {r.requestedAt} · phiên bản v{r.version}
              </span>
            </div>
            <p className="m-0 mt-1.5 whitespace-pre-wrap break-words text-ink">{r.message}</p>
            {r.status !== "OPEN" && (
              <p className="m-0 mt-1.5 text-muted">
                {r.resolvedBy} · {r.resolvedAt}
                {r.resolutionNote ? ` · ${r.resolutionNote}` : ""}
              </p>
            )}
            {canResolve && r.status === "OPEN" && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => setTarget({ id: r.id, outcome: "RESOLVED" })}
                >
                  Đã xử lý
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => setTarget({ id: r.id, outcome: "DECLINED" })}
                >
                  Từ chối
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(target)}
        title={target?.outcome === "RESOLVED" ? "Đánh dấu đã xử lý" : "Từ chối yêu cầu"}
        okText="Xác nhận"
        cancelText="Hủy"
        okButtonProps={{ loading: busy }}
        onOk={() => void submit()}
        onCancel={() => setTarget(undefined)}
        destroyOnHidden
      >
        <Input.TextArea
          aria-label="Ghi chú xử lý"
          autoSize={{ minRows: 3 }}
          placeholder="Ghi chú gửi cho người yêu cầu (không bắt buộc)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>
    </section>
  );
};
