// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { ReactElement } from "react";
import { useState } from "react";
import { App, Avatar, Button, Flex, Input, List, Popconfirm, Space, Typography } from "antd";
import { request } from "../../api/client";
import { formatDate } from "../../utils/format";
import type { DocumentComments } from "./types";

type Comment = DocumentComments["comments"][number];
type Props = { doc: DocumentComments; entityType: string; me: string; onChange: () => void };

const initials = (name?: string) => (name ?? "?").split(" ").slice(-1)[0]?.[0] ?? "?";

export const Comments = ({ doc, entityType, me, onChange }: Props) => {
  const { message } = App.useApp();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (doc: string, vars: Record<string, unknown>) => {
    setBusy(true);
    try {
      await request(doc, vars);
      onChange();
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!body.trim()) return;
    const ok = await run(
      `mutation Comment($o: collab_comment_insert_input!) { insert_collab_comment_one(object: $o) { id } }`,
      { o: { entity_type: entityType, entity_id: doc.id, body: body.trim(), parent_id: replyTo?.id ?? null } },
    );
    if (ok) { setBody(""); setReplyTo(null); }
  };

  const remove = (c: Comment) => run(
    // CSDL đặt lại giờ xóa và xóa nội dung (xóa mềm); giá trị gửi lên chỉ để đánh dấu.
    `mutation Del($id: uuid!, $at: timestamptz!) { update_collab_comment_by_pk(pk_columns: {id: $id}, _set: {deleted_at: $at}) { id } }`,
    { id: c.id, at: new Date().toISOString() });

  const roots = doc.comments.filter((c) => !c.parent_id);
  const replies = (id: string) => doc.comments.filter((c) => c.parent_id === id);

  const render = (c: Comment, depth = 0): ReactElement => (
    <div key={c.id} style={{ marginLeft: depth * 40 }}>
      <List.Item style={{ alignItems: "flex-start" }}>
        <List.Item.Meta
          avatar={<Avatar>{initials(c.author?.full_name)}</Avatar>}
          title={<Space>{c.author?.full_name}<Typography.Text type="secondary">{formatDate(c.created_at)}{c.edited_at ? " · đã sửa" : ""}</Typography.Text></Space>}
          description={c.deleted_at ? <Typography.Text type="secondary" italic>Bình luận đã bị xóa</Typography.Text> : (
            <>
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>{c.body}</Typography.Paragraph>
              <Space size="small">
                {depth === 0 && <Button size="small" type="link" onClick={() => setReplyTo(c)}>Trả lời</Button>}
                {c.author_id === me && (
                  <Popconfirm title="Xóa bình luận?" okText="Xóa" cancelText="Không" onConfirm={() => remove(c)}>
                    <Button size="small" type="link" danger>Xóa</Button>
                  </Popconfirm>)}
              </Space>
            </>)} />
      </List.Item>
      {replies(c.id).map((r) => render(r, depth + 1))}
    </div>
  );

  return (
    <>
      <List locale={{ emptyText: "Chưa có trao đổi" }} dataSource={roots} renderItem={(c) => render(c)} />
      {replyTo && (
        <Typography.Text type="secondary">Trả lời {replyTo.author?.full_name} · <a onClick={() => setReplyTo(null)}>bỏ</a></Typography.Text>
      )}
      <Flex gap={8} style={{ marginTop: 8 }}>
        <Input.TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={4000}
                        placeholder="Trao đổi với người lập, người duyệt..." />
        <Button type="primary" onClick={send} loading={busy} disabled={!body.trim()}>Gửi</Button>
      </Flex>
    </>
  );
};
