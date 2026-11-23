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

import { useGo, useInvalidate, useList } from "@refinedev/core";
import { Button, Empty, List, Popover, Typography } from "antd";
import { Bell } from "lucide-react";
import gql from "graphql-tag";

import { request } from "../../api/client";
import { formatDate } from "../../utils/format";
import { iconButtonClass } from "../layout/styles";
import { tr, trf } from "../../i18n";

const NOTIFICATIONS = gql`
  query Notifications(
    $limit: Int
    $offset: Int
    $order_by: [collab_notification_order_by!]
    $where: collab_notification_bool_exp
  ) {
    collab_notification(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      kind
      title
      body
      created_at
      read_at
      entity_type
      entity_id
    }
    collab_notification_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
};

const RESOURCE: Record<string, string> = {
  "proc.purchase_request": "proc_purchase_request",
  "hr.onboarding_request": "hr_onboarding_request",
  "ic.ic_order": "ic_ic_order",
};

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
    await request(`mutation Read($ids: _uuid) { collab_mark_notifications_read(args: {ids: $ids}) { id } }`, {
      ids: ids ? `{${ids.join(",")}}` : null,
    });
    invalidate({ resource: "collab_notification", invalidates: ["list"] });
  };

  const open = async (n: Note) => {
    await markRead([n.id]);
    const resource = n.entity_type ? RESOURCE[n.entity_type] : undefined;
    if (n.entity_id && resource) go({ to: { resource, action: "show", id: n.entity_id } });
    else if (n.entity_id && n.entity_type === "collab.kb_document") go({ to: `/h/library/proposals/${n.entity_id}` });
    else if (n.entity_type === "hr.personnel_decision") go({ to: "/h/decisions" });
    else if (n.entity_type === "chat.conversation" && n.entity_id) go({ to: `/h/chat/${n.entity_id}` });
    else if (n.entity_type === "pm.project" && n.entity_id) go({ to: `/p/projects/${n.entity_id}` });
    else if (n.entity_type === "cal.event" && n.entity_id) go({ to: `/h/calendar?event=${n.entity_id}` });
    else if (n.entity_type === "wf.process_model" && n.entity_id) go({ to: `/p/process?id=${n.entity_id}` });
    else if (n.entity_type === "core.tenant") go({ to: "/admin/company" });
    else if (n.entity_type === "core.ai_suggestion") go({ to: "/p/inbox" });
    else if (n.entity_type?.startsWith("x_")) go({ to: `/x/${n.entity_type}` });
  };

  const content = (
    <div style={{ width: 360, maxHeight: 420, overflow: "auto" }}>
      {result.data.length === 0 ? (
        <Empty description={tr("Không có thông báo mới")} />
      ) : (
        <List
          size="small"
          dataSource={result.data}
          renderItem={(n) => (
            <List.Item style={{ cursor: "pointer" }} onClick={() => open(n)}>
              <List.Item.Meta
                title={n.title}
                description={
                  <>
                    {n.body && (
                      <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                        {n.body}
                      </Typography.Paragraph>
                    )}
                    <Typography.Text type="secondary">{formatDate(n.created_at)}</Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={
        <span>
          {tr("Thông báo")}{" "}
          {unread > 0 && (
            <Button size="small" type="link" onClick={() => markRead()}>
              {tr("Đánh dấu đã đọc tất cả")}
            </Button>
          )}
        </span>
      }
      content={content}
    >
      <button type="button" className={iconButtonClass} aria-label={trf("{0} thông báo chưa đọc", [unread])}>
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-ui bg-red-500 ring-2 ring-surface" aria-hidden />
        )}
      </button>
    </Popover>
  );
};
