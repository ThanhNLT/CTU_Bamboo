/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { App, Dropdown, Input, Spin, Tooltip } from "antd";
import dayjs from "dayjs";
import {
  ArrowLeft,
  CornerUpLeft,
  FileText,
  Info,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Search,
  SendHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useSubscription } from "../../../live/useSubscription";
import { tr, trf } from "../../../i18n";
import { cn } from "../../../utils/cn";
import {
  downloadUrl,
  editMessage,
  fetchOlder,
  LATEST,
  markRead,
  MEMBERS,
  recallMessage,
  searchMessages,
  sendMessage,
  uploadFile,
} from "../api";
import { fold, splitMessage } from "../text";
import type { Conversation, Member, Message } from "../types";
import { KIND_ICON } from "./ConversationList";

const EDIT_HOURS = 24;

const dayLabel = (iso: string) => {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), "day")) return tr("Hôm nay");
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return tr("Hôm qua");
  return d.format("dddd, DD/MM/YYYY");
};

const size = (n: number) => (n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const Body = ({ m, names, mine }: { m: Message; names: string[]; mine: boolean }) => (
  <>
    {splitMessage(m.body, names).map((p, i) =>
      p.url ? (
        <a
          key={i}
          href={p.text}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("break-all underline", mine ? "text-white!" : "text-bamboo-700!")}
        >
          {p.text}
        </a>
      ) : p.mention ? (
        <span key={i} className={cn("font-semibold", mine ? "text-white" : "text-bamboo-700")}>
          {p.text}
        </span>
      ) : (
        <span key={i}>{p.text}</span>
      ),
    )}
  </>
);

export const Thread = ({
  conversation,
  me,
  onBack,
  onInfo,
}: {
  conversation: Conversation;
  me: string;
  onBack: () => void;
  onInfo: () => void;
}) => {
  const { message } = App.useApp();
  const id = conversation.id;
  const latest = useSubscription<{ chat_message: Message[] }>(LATEST, { c: id });
  const membersSub = useSubscription<{ chat_member: Member[] }>(MEMBERS, { c: id });
  const members = useMemo(() => membersSub.data?.chat_member ?? [], [membersSub.data]);
  const [older, setOlder] = useState<Message[]>([]);
  const [noMore, setNoMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [hits, setHits] = useState<Message[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastRead = useRef(0);

  useEffect(() => {
    setOlder([]);
    setNoMore(false);
    setReply(null);
    setEditing(null);
    setText("");
    setMentions(new Map());
    setSearching(null);
    setHits(null);
    atBottom.current = true;
    lastRead.current = 0;
  }, [id]);

  const messages = useMemo(() => {
    const live = latest.data?.chat_message ?? [];
    const seen = new Set(live.map((m) => m.id));
    return [...older.filter((m) => !seen.has(m.id)), ...live].sort((a, b) => a.id - b.id);
  }, [latest.data, older]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const names = useMemo(() => members.map((m) => m.person.full_name), [members]);
  const newest = messages.at(-1)?.id ?? 0;

  useEffect(() => {
    if (!newest || newest <= lastRead.current || !atBottom.current || document.visibilityState !== "visible") return;
    lastRead.current = newest;
    void markRead(id, me, newest).catch(() => undefined);
  }, [id, me, newest]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, id]);

  const loadOlder = useCallback(async () => {
    const first = messages[0]?.id;
    if (!first || noMore || loadingOlder) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    try {
      const rows = await fetchOlder(id, first);
      if (rows.length < 50) setNoMore(true);
      setOlder((prev) => [...rows, ...prev]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - before;
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [id, messages, noMore, loadingOlder]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 60 && (latest.data?.chat_message.length ?? 0) >= 100) void loadOlder();
    if (atBottom.current && newest > lastRead.current) {
      lastRead.current = newest;
      void markRead(id, me, newest).catch(() => undefined);
    }
  };

  const candidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = fold(mentionQuery);
    return members.filter((m) => m.person_id !== me && fold(m.person.full_name).includes(q)).slice(0, 8);
  }, [mentionQuery, members, me]);

  const onType = (value: string, caret: number | null) => {
    setText(value);
    const head = value.slice(0, caret ?? value.length);
    const at = head.match(/(?:^|\s)@([\p{L} ]{0,30})$/u);
    setMentionQuery(at ? at[1] : null);
  };

  const pickMention = (m: Member) => {
    const replaced = text.replace(/@([\p{L} ]{0,30})$/u, `@${m.person.full_name} `);
    setText(replaced === text ? `${text}@${m.person.full_name} ` : replaced);
    setMentions((prev) => new Map(prev).set(m.person_id, m.person.full_name));
    setMentionQuery(null);
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (editing) {
        await editMessage(editing.id, body);
        setEditing(null);
      } else {
        const ids = [...mentions].filter(([, name]) => body.includes(`@${name}`)).map(([pid]) => pid);
        atBottom.current = true;
        await sendMessage({ conversation_id: id, body, reply_to_id: reply?.id ?? null, mentions: ids });
        setReply(null);
      }
      setText("");
      setMentions(new Map());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const attach = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setSending(true);
    const hide = message.loading(trf("Đang tải lên và quét {0}…", [file.name]), 0);
    try {
      const attachment = await uploadFile(id, file);
      atBottom.current = true;
      await sendMessage({ conversation_id: id, body: text.trim(), attachment_id: attachment, reply_to_id: reply?.id });
      setText("");
      setReply(null);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      hide();
      setSending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const open = async (attachment: string) => {
    try {
      window.open(await downloadUrl(attachment), "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const runSearch = async (q: string) => {
    setSearching(q);
    setHits(q.trim() ? await searchMessages(id, q.trim()) : null);
  };

  const readers = (m: Message) =>
    members.filter((x) => x.person_id !== m.sender_id && x.last_read_id >= m.id).map((x) => x.person.full_name);

  const Icon = KIND_ICON[conversation.kind];
  const lastMine = [...messages].reverse().find((m) => m.sender_id === me && !m.deleted_at);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-bamboo-50 lg:hidden"
          aria-label={tr("Quay lại danh sách")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bamboo-50 text-bamboo-700"
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-ink">{conversation.display_name}</h2>
          <p className="m-0 text-[12px] text-muted">
            {conversation.kind === "DIRECT" ? tr("Tin nhắn riêng") : trf("{0} thành viên", [members.length || "…"])}
          </p>
        </div>
        <Tooltip title={tr("Tìm trong cuộc trò chuyện")}>
          <button
            type="button"
            onClick={() => (searching === null ? setSearching("") : (setSearching(null), setHits(null)))}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-bamboo-50"
            aria-label={tr("Tìm trong cuộc trò chuyện")}
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
        </Tooltip>
        <Tooltip title={tr("Thông tin cuộc trò chuyện")}>
          <button
            type="button"
            onClick={onInfo}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-bamboo-50"
            aria-label={tr("Thông tin cuộc trò chuyện")}
          >
            <Info className="h-[18px] w-[18px]" />
          </button>
        </Tooltip>
      </header>

      {searching !== null && (
        <div className="border-b border-line px-4 py-2">
          <Input.Search
            autoFocus
            allowClear
            placeholder={tr("Tìm tin nhắn theo nội dung")}
            onSearch={(v) => void runSearch(v)}
          />
          {hits && (
            <ul className="m-0 mt-2 max-h-48 list-none overflow-y-auto p-0 text-[12.5px]">
              {hits.map((h) => (
                <li key={h.id} className="border-b border-line py-1.5 last:border-0">
                  <span className="font-semibold">{h.sender.full_name}</span>{" "}
                  <span className="text-muted">{dayjs(h.created_at).format("HH:mm DD/MM/YYYY")}</span>
                  <div className="truncate text-body">{h.body}</div>
                </li>
              ))}
              {hits.length === 0 && <li className="py-2 text-muted">{tr("Không thấy tin nào")}</li>}
            </ul>
          )}
        </div>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5"
        role="log"
        aria-live="polite"
        aria-label={tr("Tin nhắn")}
      >
        {!latest.data && !latest.error && <Spin className="m-8 block" />}
        {latest.error && <p className="text-center text-[13px] text-red-600">{latest.error}</p>}
        {loadingOlder && <Spin size="small" className="mx-auto mb-2 block" />}
        {latest.data && messages.length === 0 && (
          <p className="mt-10 text-center text-[13px] text-muted">{tr("Chưa có tin nhắn. Gửi lời chào đầu tiên!")}</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.sender_id === me;
          const newDay = !prev || !dayjs(prev.created_at).isSame(m.created_at, "day");
          const grouped =
            !newDay && prev?.sender_id === m.sender_id && dayjs(m.created_at).diff(prev.created_at, "minute") < 5;
          const quoted = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
          const canEdit = mine && !m.deleted_at && dayjs().diff(m.created_at, "hour") < EDIT_HOURS;
          const seenBy = m.id === lastMine?.id ? readers(m) : [];
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 text-center text-[11.5px] font-medium text-muted first-letter:uppercase">
                  {dayLabel(m.created_at)}
                </div>
              )}
              <div
                className={cn(
                  "group flex items-end gap-2",
                  mine ? "justify-end" : "justify-start",
                  grouped ? "mt-0.5" : "mt-2.5",
                )}
              >
                <div className={cn("flex max-w-[82%] flex-col sm:max-w-[68%]", mine ? "items-end" : "items-start")}>
                  {!mine && !grouped && conversation.kind !== "DIRECT" && (
                    <span className="mb-0.5 px-1 text-[11.5px] font-medium text-muted">{m.sender.full_name}</span>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-[13.5px] leading-[1.45] [overflow-wrap:anywhere] whitespace-pre-wrap",
                      m.deleted_at
                        ? "border border-dashed border-line bg-transparent italic text-muted"
                        : mine
                          ? "bg-bamboo-600 text-white"
                          : "border border-line bg-surface text-ink",
                    )}
                  >
                    {quoted && !m.deleted_at && (
                      <div
                        className={cn(
                          "mb-1.5 border-l-2 pl-2 text-[12px]",
                          mine ? "border-white/60 text-white/85" : "border-bamboo-300 text-muted",
                        )}
                      >
                        <span className="font-semibold">{quoted.sender.full_name}</span>:{" "}
                        {quoted.deleted_at
                          ? tr("Tin nhắn đã thu hồi")
                          : quoted.body.slice(0, 120) || tr("Tệp đính kèm")}
                      </div>
                    )}
                    {m.deleted_at ? tr("Tin nhắn đã thu hồi") : <Body m={m} names={names} mine={mine} />}
                    {m.attachment && !m.deleted_at && (
                      <button
                        type="button"
                        onClick={() => void open(m.attachment!.id)}
                        className={cn(
                          "mt-1.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left",
                          mine ? "bg-white/15 hover:bg-white/25" : "bg-bamboo-50 hover:bg-bamboo-100",
                        )}
                      >
                        <FileText className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold">{m.attachment.file_name}</span>
                          <span className="block text-[11px] opacity-80">{size(m.attachment.size_bytes)}</span>
                        </span>
                      </button>
                    )}
                  </div>
                  <span className="mt-0.5 px-1 text-[10.5px] text-muted">
                    {dayjs(m.created_at).format("HH:mm")}
                    {m.edited_at && !m.deleted_at && ` · ${tr("đã sửa")}`}
                    {seenBy.length > 0 &&
                      ` · ${conversation.kind === "DIRECT" ? tr("Đã xem") : trf("{0} người đã xem", [seenBy.length])}`}
                  </span>
                </div>
                {!m.deleted_at && (
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        { key: "reply", icon: <CornerUpLeft className="h-4 w-4" />, label: tr("Trả lời") },
                        ...(canEdit
                          ? [
                              { key: "edit", icon: <Pencil className="h-4 w-4" />, label: tr("Sửa") },
                              {
                                key: "recall",
                                icon: <Undo2 className="h-4 w-4" />,
                                label: tr("Thu hồi"),
                                danger: true,
                              },
                            ]
                          : []),
                      ],
                      onClick: ({ key }) => {
                        if (key === "reply") setReply(m);
                        if (key === "edit") {
                          setEditing(m);
                          setText(m.body);
                        }
                        if (key === "recall")
                          void recallMessage(m.id).catch((e) => message.error((e as Error).message));
                      },
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "mb-5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity hover:bg-bamboo-50 focus:opacity-100 group-hover:opacity-100 max-md:opacity-60",
                        mine ? "order-first" : "",
                      )}
                      aria-label={tr("Thao tác với tin nhắn")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </Dropdown>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="relative border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-4">
        {(reply || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-bamboo-50 px-3 py-1.5 text-[12.5px]">
            {reply ? (
              <CornerUpLeft className="h-4 w-4 text-bamboo-700" />
            ) : (
              <Pencil className="h-4 w-4 text-bamboo-700" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {reply
                ? trf("Trả lời {0}: {1}", [reply.sender.full_name, reply.body.slice(0, 80) || tr("Tệp đính kèm")])
                : tr("Đang sửa tin nhắn")}
            </span>
            <button
              type="button"
              onClick={() => {
                setReply(null);
                if (editing) {
                  setEditing(null);
                  setText("");
                }
              }}
              aria-label={tr("Bỏ")}
              className="grid h-6 w-6 place-items-center rounded-full hover:bg-bamboo-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {candidates.length > 0 && (
          <ul
            className="absolute bottom-full left-3 z-10 m-0 mb-1 w-64 list-none rounded-[16px] border border-line bg-[var(--surface-solid)] p-1 shadow-float"
            role="listbox"
            aria-label={tr("Nhắc tên thành viên")}
          >
            {candidates.map((c) => (
              <li key={c.person_id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(c);
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-bamboo-50"
                >
                  {c.person.full_name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.csv,.md"
            onChange={(e) => void attach(e.target.files)}
          />
          <Tooltip title={tr("Gửi tệp (quét virus trước khi gửi)")}>
            <button
              type="button"
              disabled={sending || !!editing}
              onClick={() => fileInput.current?.click()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-bamboo-50 disabled:opacity-40"
              aria-label={tr("Gửi tệp")}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </Tooltip>
          <Input.TextArea
            value={text}
            autoSize={{ minRows: 1, maxRows: 6 }}
            maxLength={4000}
            placeholder={tr("Nhập tin nhắn, gõ @ để nhắc tên")}
            aria-label={tr("Nội dung tin nhắn")}
            onChange={(e) => onType(e.target.value, e.target.selectionStart)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (candidates.length && mentionQuery !== null) pickMention(candidates[0]);
                else void submit();
              }
              if (e.key === "Escape") setMentionQuery(null);
            }}
            className="rounded-2xl! py-2!"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || !text.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bamboo-600 text-white shadow-glass-active hover:bg-[#2a6e38] disabled:opacity-40"
            aria-label={editing ? tr("Lưu tin nhắn") : tr("Gửi")}
          >
            <SendHorizontal className="h-[18px] w-[18px]" />
          </button>
        </div>
      </footer>
    </div>
  );
};
