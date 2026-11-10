/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { BellOff, Building2, MessageSquarePlus, User, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { SearchInput } from "../../../components/ui";
import { smallPrimaryButtonClass } from "../../../components/ui/buttons";
import { tr } from "../../../i18n";
import { cn } from "../../../utils/cn";
import { formatAgo } from "../../../utils/format";
import { fold } from "../text";
import type { Conversation, ConversationKind } from "../types";

type Filter = "all" | "unread" | ConversationKind;

export const KIND_ICON = { DIRECT: User, GROUP: Users, UNIT: Building2 } as const;

export const ConversationList = ({
  conversations,
  activeId,
  online,
  onOpen,
  onNew,
}: {
  conversations: Conversation[];
  activeId?: string;
  online: Set<string>;
  onOpen: (id: string) => void;
  onNew: () => void;
}) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return conversations.filter(
      (c) =>
        (filter === "all" || (filter === "unread" ? c.unread > 0 : c.kind === filter)) &&
        (!needle || fold(c.display_name ?? "").includes(needle)),
    );
  }, [conversations, filter, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{tr("Tin nhắn")}</h1>
        <button type="button" className={smallPrimaryButtonClass} onClick={onNew}>
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          {tr("Tin nhắn mới")}
        </button>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-3">
        <SearchInput value={q} onChange={setQ} placeholder={tr("Tìm cuộc trò chuyện")} />
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr("Lọc cuộc trò chuyện")}>
          {(
            [
              ["all", tr("Tất cả")],
              ["unread", tr("Chưa đọc")],
              ["UNIT", tr("Phòng ban")],
              ["GROUP", tr("Nhóm")],
              ["DIRECT", tr("Cá nhân")],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] font-medium transition-colors",
                filter === value ? "bg-bamboo-600 text-white" : "bg-[var(--glass-well)] text-body hover:bg-bamboo-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul
        className="m-0 min-h-0 flex-1 list-none overflow-y-auto px-2 pb-3"
        aria-label={tr("Danh sách cuộc trò chuyện")}
      >
        {shown.map((c) => {
          const Icon = KIND_ICON[c.kind];
          const muted = c.members[0]?.muted;
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                  active ? "bg-bamboo-600 text-white" : "hover:bg-bamboo-50",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-10 w-10 shrink-0 place-items-center rounded-full",
                    active ? "bg-white/20" : "bg-bamboo-50 text-bamboo-700",
                  )}
                  aria-hidden
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {c.kind === "DIRECT" && online.has(c.id) && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-bamboo-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[13.5px]", c.unread ? "font-semibold" : "font-medium")}>
                      {c.display_name ?? tr("Cuộc trò chuyện")}
                    </span>
                    {c.last_message_at && (
                      <span className={cn("shrink-0 text-[11px]", active ? "text-white/80" : "text-muted")}>
                        {formatAgo(c.last_message_at)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-[12.5px]", active ? "text-white/85" : "text-muted")}>
                      {c.last_preview ?? tr("Chưa có tin nhắn")}
                    </span>
                    {muted && (
                      <BellOff className="h-3.5 w-3.5 shrink-0 opacity-70" aria-label={tr("Đã tắt thông báo")} />
                    )}
                    {c.unread > 0 && (
                      <span
                        className={cn(
                          "ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-semibold",
                          active ? "bg-white text-bamboo-700" : "bg-bamboo-600 text-white",
                        )}
                      >
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-3 py-8 text-center text-[13px] text-muted">{tr("Không có cuộc trò chuyện phù hợp")}</li>
        )}
      </ul>
    </div>
  );
};
