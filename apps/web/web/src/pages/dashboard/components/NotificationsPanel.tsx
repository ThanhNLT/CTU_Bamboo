// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { cn } from "../../../utils/cn";
import type { NotificationItem } from "../types";
import { Panel, PanelLink, TONE_DOT } from "../../../components/ui";

export const NotificationsPanel = ({ items, limit = 3 }: { items: NotificationItem[]; limit?: number }) => {
  const [list, setList] = useState(items);
  const unread = list.filter((n) => !n.read).length;
  const markAllRead = () => setList((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) => setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

  return (
    <Panel
      title="Thông báo"
      extra={<PanelLink onClick={unread > 0 ? markAllRead : undefined}>Đọc hết</PanelLink>}
      bodyClassName="px-5 pb-5 pt-1"
    >
      <ul className="m-0 list-none space-y-4 p-0">
        {list.slice(0, limit).map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => markRead(n.id)} className="group flex w-full gap-2.5 text-left">
              {/* Chưa đọc: chấm đặc theo mức độ · Đã đọc: vòng rỗng */}
              <span
                className={cn(
                  "mt-[6px] h-2 w-2 shrink-0 rounded-full",
                  n.read ? "border border-gray-300 bg-transparent" : TONE_DOT[n.tone],
                )}
                aria-label={n.read ? "Đã đọc" : "Chưa đọc"}
              />
              <span className="min-w-0">
                <span className={cn("block text-[13px] leading-snug group-hover:underline", n.read ? "text-body" : "font-medium text-ink")}>
                  {n.title}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted">
                  {n.time}
                  {n.source && ` · ${n.source}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
};
