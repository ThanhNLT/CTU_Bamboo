import { useContext } from "react";

import { SessionContext } from "../../auth/useSession";
import { useSubscription } from "../../live/useSubscription";
import { UNREAD } from "./api";

/** Tổng tin chưa đọc (bỏ cuộc đã tắt thông báo) cho huy hiệu "Tin nhắn" ở menu và thanh dưới trên điện thoại. */
export const useUnreadTotal = () => {
  const me = useContext(SessionContext)?.tenant.person_id;
  const { data } = useSubscription<{ chat_conversation: { id: string; unread: number }[] }>(UNREAD, { me }, !me);
  return (data?.chat_conversation ?? []).reduce((n, c) => n + c.unread, 0);
};
