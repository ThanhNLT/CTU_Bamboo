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

import type { ReactElement } from "react";
import { useState } from "react";
import { App, Avatar, Button, Flex, Input, List, Popconfirm, Space, Typography } from "antd";
import { EyeInvisibleOutlined } from "@ant-design/icons";

import { request } from "../../api/client";
import { formatDate } from "../../utils/format";
import type { DocumentComments } from "./types";
import { tr } from "../../i18n";

type Comment = DocumentComments["comments"][number];
type PiiCheck = { masked_text: string; entities: { label: string }[] };
type Props = { doc: DocumentComments; entityType: string; me: string; onChange: () => void };

const initials = (name?: string) => (name ?? "?").split(" ").slice(-1)[0]?.[0] ?? "?";

export const Comments = ({ doc, entityType, me, onChange }: Props) => {
  const { message, modal } = App.useApp();
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

  const post = async (text: string) => {
    const draft = { body, replyTo };
    setBody("");
    setReplyTo(null);
    const ok = await run(
      `mutation Comment($o: collab_comment_insert_input!) { insert_collab_comment_one(object: $o) { id } }`,
      { o: { entity_type: entityType, entity_id: doc.id, body: text, parent_id: draft.replyTo?.id ?? null } },
    );
    if (!ok) {
      setBody(draft.body);
      setReplyTo(draft.replyTo);
    }
  };

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    let check: PiiCheck | null = null;
    try {
      check = (
        await request<{ check_pii: PiiCheck }>(
          `query CheckPii($t: String!) { check_pii(text: $t) { masked_text entities { label } } }`,
          { t: text },
        )
      ).check_pii;
    } catch {
      check = null;
    }
    if (!check?.entities.length) {
      await post(text);
      return;
    }
    const labels = [...new Set(check.entities.map((e) => e.label))].join(", ");
    const masked = check.masked_text;
    const dialog = modal.confirm({
      title: tr("Nội dung có dữ liệu cá nhân"),
      icon: <EyeInvisibleOutlined />,
      width: 520,
      content: (
        <>
          <Typography.Paragraph>
            {tr("Phát hiện: ")} <b>{labels}</b>
            {tr(". Mọi người xem được chứng từ đều đọc được trao đổi này.")}
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ whiteSpace: "pre-wrap" }}>
            {tr("Bản đã che: ")} {masked}
          </Typography.Paragraph>
        </>
      ),
      footer: (
        <Space style={{ marginTop: 16, width: "100%", justifyContent: "flex-end" }} wrap>
          <Button onClick={() => dialog.destroy()}>{tr("Sửa lại")}</Button>
          <Button
            danger
            onClick={() => {
              dialog.destroy();
              void post(text);
            }}
          >
            {tr("Vẫn gửi nguyên văn")}
          </Button>
          <Button
            type="primary"
            onClick={() => {
              dialog.destroy();
              void post(masked);
            }}
          >
            {tr("Gửi bản đã che")}
          </Button>
        </Space>
      ),
    });
  };

  const remove = (c: Comment) =>
    run(
      `mutation Del($id: uuid!, $at: timestamptz!) { update_collab_comment_by_pk(pk_columns: {id: $id}, _set: {deleted_at: $at}) { id } }`,
      { id: c.id, at: new Date().toISOString() },
    );

  const roots = doc.comments.filter((c) => !c.parent_id);
  const replies = (id: string) => doc.comments.filter((c) => c.parent_id === id);

  const render = (c: Comment, depth = 0): ReactElement => (
    <div key={c.id} style={{ marginLeft: depth * 40 }}>
      <List.Item style={{ alignItems: "flex-start" }}>
        <List.Item.Meta
          avatar={<Avatar>{initials(c.author?.full_name)}</Avatar>}
          title={
            <Space>
              {c.author?.full_name}
              <Typography.Text type="secondary">
                {formatDate(c.created_at)}
                {c.edited_at ? tr(" · đã sửa") : ""}
              </Typography.Text>
            </Space>
          }
          description={
            c.deleted_at ? (
              <Typography.Text type="secondary" italic>
                {tr("Bình luận đã bị xóa")}
              </Typography.Text>
            ) : (
              <>
                <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>
                  {c.body}
                </Typography.Paragraph>
                <Space size="small">
                  {depth === 0 && (
                    <Button size="small" type="link" onClick={() => setReplyTo(c)}>
                      {tr("Trả lời")}
                    </Button>
                  )}
                  {c.author_id === me && (
                    <Popconfirm
                      title={tr("Xóa bình luận?")}
                      okText={tr("Xóa")}
                      cancelText={tr("Không")}
                      onConfirm={() => remove(c)}
                    >
                      <Button size="small" type="link" danger>
                        {tr("Xóa")}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </>
            )
          }
        />
      </List.Item>
      {replies(c.id).map((r) => render(r, depth + 1))}
    </div>
  );

  return (
    <>
      <List locale={{ emptyText: tr("Chưa có trao đổi") }} dataSource={roots} renderItem={(c) => render(c)} />
      {replyTo && (
        <Typography.Text type="secondary">
          {tr("Trả lời ")} {replyTo.author?.full_name} · <a onClick={() => setReplyTo(null)}>{tr("bỏ")}</a>
        </Typography.Text>
      )}
      <Flex gap={8} style={{ marginTop: 8 }}>
        <Input.TextArea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder={tr("Trao đổi với người lập, người duyệt...")}
        />
        <Button type="primary" onClick={send} loading={busy ? { delay: 200 } : false} disabled={!body.trim()}>
          {tr("Gửi")}
        </Button>
      </Flex>
    </>
  );
};
