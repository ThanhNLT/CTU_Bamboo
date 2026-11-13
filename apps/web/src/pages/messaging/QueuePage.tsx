/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { App, Button, Spin, Table, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";

import { queueOverview, retryMessage, verifyMessage, type QueueCount, type QueueMessage } from "./api";
import { tr, trf } from "../../i18n";

const STATUS = {
  PENDING: { color: "processing", label: tr("Chờ gửi") },
  LEASED: { color: "processing", label: tr("Đang gửi") },
  DELIVERED: { color: "green", label: tr("Đã giao") },
  DEAD: { color: "red", label: tr("Hàng chết") },
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
        title: r.valid ? tr("Biên nhận hợp lệ") : tr("Biên nhận không hợp lệ"),
        content: r.valid
          ? trf("Chữ ký {0} khớp nội dung đã gửi (giao lúc {1}).", [r.alg, r.delivered_at])
          : (r.reason ?? tr("Không xác minh được.")),
      });
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const retry = async (id: string) => {
    try {
      await retryMessage(id);
      message.success(tr("Đã đưa lại vào hàng đợi."));
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {tr("Hàng đợi tin nhắn")}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {tr(
            "Tin gửi ra ngoài ứng dụng (email, SMS, webhook): thử lại lùi dần, hết lượt vào hàng chết, mỗi tin giao có biên nhận ký số gắn với mã băm nội dung.",
          )}
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
          { title: tr("Kênh"), dataIndex: "topic", width: 150, render: (t: string) => t.replace("notify.", "") },
          { title: tr("Nội dung"), dataIndex: "title" },
          { title: tr("Đến"), dataIndex: "address", width: 170 },
          {
            title: tr("Trạng thái"),
            dataIndex: "status",
            width: 130,
            render: (s: keyof typeof STATUS) => <Tag color={STATUS[s]?.color}>{STATUS[s]?.label ?? s}</Tag>,
          },
          { title: tr("Lần thử"), width: 90, render: (_: unknown, r) => `${r.attempts}/${r.max_attempts}` },
          { title: tr("Lỗi"), dataIndex: "last_error", ellipsis: true },
          { title: tr("Tạo lúc"), dataIndex: "created_at", width: 170 },
          {
            title: "",
            width: 190,
            render: (_: unknown, r) => (
              <>
                {r.status === "DEAD" && (
                  <Button size="small" onClick={() => void retry(r.id)}>
                    {tr("Gửi lại")}
                  </Button>
                )}
                {r.status === "DELIVERED" && (
                  <Button size="small" onClick={() => void verify(r.id)}>
                    {tr("Xác minh biên nhận")}
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
