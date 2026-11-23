/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { App, Button, Drawer, Input, Popconfirm, Switch, Tag } from "antd";
import { LogOut, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";

import { useSubscription } from "../../../live/useSubscription";
import { tr } from "../../../i18n";
import { leave, MEMBERS, setMuted, updateGroup } from "../api";
import type { Conversation, Member } from "../types";
import { PeoplePicker } from "./NewConversation";

export const InfoDrawer = ({
  open,
  conversation,
  me,
  onClose,
  onLeft,
}: {
  open: boolean;
  conversation: Conversation;
  me: string;
  onClose: () => void;
  onLeft: () => void;
}) => {
  const { message } = App.useApp();
  const sub = useSubscription<{ chat_member: Member[] }>(MEMBERS, { c: conversation.id }, !open);
  const members = sub.data?.chat_member ?? [];
  const owner = conversation.kind === "GROUP" && conversation.members[0]?.role === "OWNER";
  const [title, setTitle] = useState(conversation.title ?? "");
  const [adding, setAdding] = useState<string[]>([]);

  useEffect(() => {
    setTitle(conversation.title ?? "");
    setAdding([]);
  }, [conversation.id, conversation.title]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) message.success(done);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={conversation.display_name} width={360}>
      <div className="flex flex-col gap-5">
        <label className="flex items-center justify-between gap-3 text-[13.5px]">
          <span>{tr("Tắt thông báo")}</span>
          <Switch
            checked={!!conversation.members[0]?.muted}
            onChange={(v) => void run(() => setMuted(conversation.id, me, v))}
          />
        </label>
        {conversation.kind === "UNIT" && (
          <p className="m-0 text-[12.5px] text-muted">
            {tr(
              "Kênh của đơn vị: thành viên là người đang công tác trong đơn vị và các đơn vị con, tự cập nhật khi điều chuyển.",
            )}
          </p>
        )}
        {owner && (
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-muted">{tr("Tên nhóm")}</span>
            <div className="flex gap-2">
              <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
              <Button
                disabled={!title.trim() || title === conversation.title}
                onClick={() => void run(() => updateGroup(conversation.id, { title }), tr("Đã đổi tên nhóm"))}
              >
                {tr("Lưu")}
              </Button>
            </div>
            <span className="mt-2 text-[12.5px] font-semibold text-muted">{tr("Thêm thành viên")}</span>
            <PeoplePicker me={me} value={adding} onChange={setAdding} exclude={members.map((m) => m.person_id)} />
            <Button
              type="primary"
              disabled={!adding.length}
              onClick={() =>
                void run(async () => {
                  await updateGroup(conversation.id, { add_ids: adding });
                  setAdding([]);
                }, tr("Đã thêm thành viên"))
              }
            >
              {tr("Thêm")}
            </Button>
          </div>
        )}
        <div>
          <span className="text-[12.5px] font-semibold text-muted">
            {tr("Thành viên")} ({members.length})
          </span>
          <ul className="m-0 mt-2 list-none p-0">
            {members.map((m) => (
              <li
                key={m.person_id}
                className="flex items-center gap-2 border-b border-line py-2 text-[13.5px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{m.person.full_name}</span>
                {m.role === "OWNER" && <Tag color="green">{tr("Chủ nhóm")}</Tag>}
                {owner && m.person_id !== me && (
                  <Popconfirm
                    title={tr("Bớt người này khỏi nhóm?")}
                    okText={tr("Bớt")}
                    cancelText={tr("Hủy")}
                    onConfirm={() => void run(() => updateGroup(conversation.id, { remove_ids: [m.person_id] }))}
                  >
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-red-600"
                      aria-label={tr("Bớt khỏi nhóm")}
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </Popconfirm>
                )}
              </li>
            ))}
          </ul>
        </div>
        {conversation.kind !== "UNIT" && (
          <Popconfirm
            title={conversation.kind === "GROUP" ? tr("Rời nhóm này?") : tr("Ẩn cuộc trò chuyện này?")}
            okText={tr("Đồng ý")}
            cancelText={tr("Hủy")}
            onConfirm={() =>
              void run(async () => {
                await leave(conversation.id);
                onLeft();
              })
            }
          >
            <Button danger icon={<LogOut className="h-4 w-4" />}>
              {conversation.kind === "GROUP" ? tr("Rời nhóm") : tr("Ẩn cuộc trò chuyện")}
            </Button>
          </Popconfirm>
        )}
      </div>
    </Drawer>
  );
};
