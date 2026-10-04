// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thông báo của chính người dùng (collab.notification sinh bằng trigger, ADR #20), tự cập nhật.
import { useGo, useInvalidate, useList } from "@refinedev/core";
import { Badge, Button, Empty, List, Popover, Typography } from "antd";
import { BellOutlined } from "@ant-design/icons";
import gql from "graphql-tag";
import { request } from "../../api/client";
import { formatDate } from "../../utils/format";

const NOTIFICATIONS = gql`
  query Notifications($limit: Int, $offset: Int, $order_by: [collab_notification_order_by!], $where: collab_notification_bool_exp) {
    collab_notification(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id kind title body created_at read_at entity_id
    }
    collab_notification_aggregate(where: $where) { aggregate { count } }
  }
`;

type Note = { id: string; kind: string; title: string; body: string | null; created_at: string; read_at: string | null; entity_id: string | null };

export const NotificationBell = () => {
  const go = useGo();
  const invalidate = useInvalidate();
  const { result } = useList<Note>({
    resource: "collab_notification",
    filters: [{ field: "read_at", operator: "null", value: true }],
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { pageSize: 20 },
    meta: { gqlQuery: NOTIFICATIONS },
    liveMode: "auto",
  });
  const unread = result.total ?? 0;

  const markRead = async (ids?: string[]) => {
    await request(`mutation Read($ids: _uuid) { collab_mark_notifications_read(args: {ids: $ids}) { id } }`,
                  { ids: ids ? `{${ids.join(",")}}` : null });
    invalidate({ resource: "collab_notification", invalidates: ["list"] });
  };

  const open = async (n: Note) => {
    await markRead([n.id]);
    if (n.entity_id) go({ to: { resource: "proc_purchase_request", action: "show", id: n.entity_id } });
  };

  const content = (
    <div style={{ width: 360, maxHeight: 420, overflow: "auto" }}>
      {result.data.length === 0 ? <Empty description="Không có thông báo mới" /> : (
        <List size="small" dataSource={result.data} renderItem={(n) => (
          <List.Item style={{ cursor: "pointer" }} onClick={() => open(n)}>
            <List.Item.Meta title={n.title} description={
              <>{n.body && <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{n.body}</Typography.Paragraph>}
                <Typography.Text type="secondary">{formatDate(n.created_at)}</Typography.Text></>} />
          </List.Item>)} />
      )}
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" title={
      <span>Thông báo {unread > 0 && <Button size="small" type="link" onClick={() => markRead()}>Đánh dấu đã đọc tất cả</Button>}</span>}
      content={content}>
      <Badge count={unread} size="small">
        <Button type="text" icon={<BellOutlined />} aria-label={`${unread} thông báo chưa đọc`} />
      </Badge>
    </Popover>
  );
};
