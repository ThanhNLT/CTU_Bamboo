import { Alert } from "antd";
import { MessagesSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { useSession } from "../../auth/useSession";
import { useOnline } from "../../live/presence";
import { useSubscription } from "../../live/useSubscription";
import { tr } from "../../i18n";
import { cn } from "../../utils/cn";
import { CONVERSATIONS } from "./api";
import { ConversationList } from "./components/ConversationList";
import { InfoDrawer } from "./components/InfoDrawer";
import { NewConversation } from "./components/NewConversation";
import { Thread } from "./components/Thread";
import type { Conversation } from "./types";

/**
 * Nhắn tin (ADR #65): danh sách cuộc trò chuyện bên trái, nội dung bên phải; màn hình hẹp (điện thoại) chỉ hiện một
 * trong hai. Tin mới, số chưa đọc, sửa, thu hồi cập nhật tức thì qua subscription Hasura.
 */
export const ChatPage = () => {
  const { tenant } = useSession();
  const me = tenant.person_id;
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [info, setInfo] = useState(false);
  const sub = useSubscription<{ chat_conversation: Conversation[] }>(CONVERSATIONS, { me });
  const conversations = useMemo(() => sub.data?.chat_conversation ?? [], [sub.data]);
  const online = useOnline();
  const onlineConversations = useMemo(() => {
    const people = new Set(online.map((p) => p.person_id));
    return new Set(
      conversations.filter((c) => c.kind === "DIRECT" && people.has(c.peer[0]?.person_id)).map((c) => c.id),
    );
  }, [online, conversations]);
  const active = conversations.find((c) => c.id === id);
  const open = (next: string) => navigate(`/h/chat/${next}`);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[420px] w-full max-w-[1280px] flex-col gap-3 max-md:h-[calc(100dvh-11.5rem-env(safe-area-inset-bottom))]">
      {sub.error && <Alert type="error" showIcon message={tr("Không tải được tin nhắn")} description={sub.error} />}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-surface shadow-card">
        <aside
          className={cn(
            "min-h-0 w-full border-r border-line lg:block lg:w-[340px] lg:shrink-0",
            id ? "hidden" : "block",
          )}
        >
          <ConversationList
            conversations={conversations}
            activeId={id}
            online={onlineConversations}
            onOpen={open}
            onNew={() => setCreating(true)}
          />
        </aside>
        <section className={cn("min-h-0 min-w-0 flex-1", id ? "block" : "hidden lg:block")}>
          {active ? (
            <Thread conversation={active} me={me} onBack={() => navigate("/h/chat")} onInfo={() => setInfo(true)} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-bamboo-50 text-bamboo-700">
                  <MessagesSquare className="h-7 w-7" aria-hidden />
                </span>
                <h2 className="mt-3 text-[17px] font-semibold text-ink">
                  {id && sub.data ? tr("Không tìm thấy cuộc trò chuyện") : tr("Chọn một cuộc trò chuyện")}
                </h2>
                <p className="mx-auto mt-1 max-w-[340px] text-[13px] text-muted">
                  {tr("Nhắn riêng với đồng nghiệp, lập nhóm theo việc, hoặc trao đổi trong kênh phòng ban của bạn.")}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      <NewConversation
        open={creating}
        me={me}
        onClose={() => setCreating(false)}
        onOpened={(next) => {
          setCreating(false);
          open(next);
        }}
      />
      {active && (
        <InfoDrawer
          open={info}
          conversation={active}
          me={me}
          onClose={() => setInfo(false)}
          onLeft={() => {
            setInfo(false);
            navigate("/h/chat");
          }}
        />
      )}
    </div>
  );
};

export default ChatPage;
