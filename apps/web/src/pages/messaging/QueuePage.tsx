// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Button, Spin, Table, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";

import { queueOverview, retryMessage, verifyMessage, type QueueCount, type QueueMessage } from "./api";

const STATUS = {
  PENDING: { color: "processing", label: "Chờ gửi" },
  LEASED: { color: "processing", label: "Đang gửi" },
  DELIVERED: { color: "green", label: "Đã giao" },
  DEAD: { color: "red", label: "Hàng chết" },
} as const;

export const QueuePage = () => {
  const { message, modal } = App.useApp();
  const [data, setData] = useState<{ counts: QueueCount[]; messages: QueueMessage[] }>();

  const load = useCallback(
    () =>
      queueOverview()
        .then(setData)
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  const verify = async (id: string) => {
    try {
      const r = await verifyMessage(id);
      modal.info({
        title: r.valid ? "Biên nhận hợp lệ" : "Biên nhận không hợp lệ",
        content: r.valid
          ? `Chữ ký ${r.alg} khớp nội dung đã gửi (giao lúc ${r.delivered_at}).`
          : (r.reason ?? "Không xác minh được."),
      });
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const retry = async (id: string) => {
    try {
      await retryMessage(id);
      message.success("Đã đưa lại vào hàng đợi.");
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  if (!data) return <Spin className="mt-24 block" />;
  const total = (status: string) => data.counts.filter((c) => c.status === status).reduce((s, c) => s + c.n, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Hàng đợi tin nhắn</h1>
        <p className="mt-1 text-[13px] text-muted">
          Tin gửi ra ngoài ứng dụng (email, SMS, webhook): thử lại lùi dần, hết lượt vào hàng chết, mỗi tin giao có biên
          nhận ký số gắn với mã băm nội dung.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["PENDING", "LEASED", "DELIVERED", "DEAD"] as const).map((s) => (
          <div key={s} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="text-[12px] text-muted">{STATUS[s].label}</div>
            <div className="text-[26px] font-semibold text-ink">{total(s)}</div>
          </div>
        ))}
      </div>
      <Table<QueueMessage>
        rowKey="id"
        size="small"
        dataSource={data.messages}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          { title: "Kênh", dataIndex: "topic", width: 150, render: (t: string) => t.replace("notify.", "") },
          { title: "Nội dung", dataIndex: "title" },
          { title: "Đến", dataIndex: "address", width: 170 },
          {
            title: "Trạng thái",
            dataIndex: "status",
            width: 130,
            render: (s: keyof typeof STATUS) => <Tag color={STATUS[s]?.color}>{STATUS[s]?.label ?? s}</Tag>,
          },
          { title: "Lần thử", width: 90, render: (_: unknown, r) => `${r.attempts}/${r.max_attempts}` },
          { title: "Lỗi", dataIndex: "last_error", ellipsis: true },
          { title: "Tạo lúc", dataIndex: "created_at", width: 170 },
          {
            title: "",
            width: 190,
            render: (_: unknown, r) => (
              <>
                {r.status === "DEAD" && (
                  <Button size="small" onClick={() => void retry(r.id)}>
                    Gửi lại
                  </Button>
                )}
                {r.status === "DELIVERED" && (
                  <Button size="small" onClick={() => void verify(r.id)}>
                    Xác minh biên nhận
                  </Button>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
