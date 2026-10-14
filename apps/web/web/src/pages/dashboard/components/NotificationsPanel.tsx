// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useNavigate } from "react-router";

import { cn } from "../../../utils/cn";
import type { NotificationItem } from "../types";
import { Panel, PanelLink, TONE_DOT } from "../../../components/ui";

export const NotificationsPanel = ({
  items,
  unread,
  onRead,
  limit = 3,
}: {
  items: NotificationItem[];
  unread: number;
  onRead: (ids?: string[]) => Promise<void>;
  limit?: number;
}) => {
  const navigate = useNavigate();
  const open = async (n: NotificationItem) => {
    if (!n.read) await onRead([n.id]);
    if (n.to) navigate(n.to);
  };

  return (
    <Panel
      title="Thông báo"
      extra={<PanelLink onClick={unread > 0 ? () => void onRead() : undefined}>Đọc hết</PanelLink>}
      bodyClassName="px-5 pb-5 pt-1"
    >
      {items.length === 0 && <p className="py-4 text-center text-[13px] text-muted">Chưa có thông báo.</p>}
      <ul className="m-0 list-none space-y-4 p-0">
        {items.slice(0, limit).map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => void open(n)} className="group flex w-full gap-2.5 text-left">
              <span
                className={cn(
                  "mt-[6px] h-2 w-2 shrink-0 rounded-full",
                  n.read ? "border border-gray-300 bg-transparent" : TONE_DOT[n.tone],
                )}
                aria-label={n.read ? "Đã đọc" : "Chưa đọc"}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-[13px] leading-snug group-hover:underline",
                    n.read ? "text-body" : "font-medium text-ink",
                  )}
                >
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
