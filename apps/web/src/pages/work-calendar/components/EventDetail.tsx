/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { App, Button, Modal, Popconfirm, Segmented, Tag } from "antd";
import dayjs from "dayjs";
import { Bell, CalendarDays, Download, FolderKanban, MapPin, Repeat, Users } from "lucide-react";
import { Link } from "react-router";

import { tr, trf } from "../../../i18n";
import { cn } from "../../../utils/cn";
import { cancelEvent, respond } from "../api";
import { download, KIND_DOT, KIND_LABEL, RESPONSE_LABEL, toIcs, type CalEvent, type Response } from "../model";

const REPEAT: Record<string, string> = {
  DAILY: tr("Hằng ngày"),
  WEEKLY: tr("Hằng tuần"),
  MONTHLY: tr("Hằng tháng"),
};

const when = (e: CalEvent) => {
  const s = dayjs(e.starts_at);
  const f = dayjs(e.ends_at);
  if (e.all_day) {
    const last = f.subtract(1, "day");
    return last.isSame(s, "day")
      ? s.format("dddd, DD-MMM-YYYY")
      : `${s.format("DD-MMM")} – ${last.format("DD-MMM-YYYY")}`;
  }
  return s.isSame(f, "day")
    ? `${s.format("dddd, DD-MMM-YYYY")} · ${s.format("HH:mm")}–${f.format("HH:mm")}`
    : `${s.format("HH:mm DD-MMM")} – ${f.format("HH:mm DD-MMM-YYYY")}`;
};

export const EventDetail = ({
  event,
  onClose,
  onEdit,
  onChanged,
}: {
  event: CalEvent | null;
  onClose: () => void;
  onEdit: (e: CalEvent) => void;
  onChanged: () => void;
}) => {
  const { message } = App.useApp();
  if (!event) return null;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      message.success(done);
      onChanged();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <Modal open onCancel={onClose} footer={null} title={null} width={480}>
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-start gap-2.5">
          <span className={cn("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", KIND_DOT[event.kind])} aria-hidden />
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold leading-snug text-ink">{event.title}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Tag>{KIND_LABEL[event.kind]}</Tag>
              {event.scope === "UNIT" && <Tag color="green">{trf("Lịch chung: {0}", [event.org_unit_name])}</Tag>}
            </div>
          </div>
        </div>
        <p className="m-0 flex items-center gap-2 text-[13.5px] text-body">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="capitalize">{when(event)}</span>
        </p>
        {event.recurrence !== "NONE" && (
          <p className="m-0 flex items-center gap-2 text-[13.5px] text-body">
            <Repeat className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            {REPEAT[event.recurrence]}
            {event.recur_until && ` · ${trf("đến {0}", [dayjs(event.recur_until).format("DD-MMM-YYYY")])}`}
          </p>
        )}
        {event.location && (
          <p className="m-0 flex items-center gap-2 text-[13.5px] text-body">
            <MapPin className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            {/^https?:\/\//.test(event.location) ? (
              <a href={event.location} target="_blank" rel="noopener noreferrer" className="break-all">
                {event.location}
              </a>
            ) : (
              event.location
            )}
          </p>
        )}
        {event.reminder_minutes != null && (
          <p className="m-0 flex items-center gap-2 text-[13.5px] text-body">
            <Bell className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            {event.reminder_minutes === 0
              ? tr("Nhắc khi bắt đầu")
              : trf("Nhắc trước {0} phút", [event.reminder_minutes])}
          </p>
        )}
        {event.description && <p className="m-0 whitespace-pre-wrap text-[13.5px] text-body">{event.description}</p>}
        {event.source === "project" && event.project_id && (
          <Link to={`/p/projects/${event.project_id}`} className="flex items-center gap-2 text-[13.5px] font-semibold">
            <FolderKanban className="h-4 w-4" aria-hidden />
            {tr("Mở dự án")}
          </Link>
        )}
        {event.source === "event" && (
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
              <Users className="h-4 w-4" aria-hidden />
              {trf("Người tổ chức: {0}", [event.organizer_name])}
            </span>
            {event.attendees.length > 0 && (
              <ul className="m-0 list-none p-0 pl-6 text-[13px]">
                {event.attendees.map((a) => (
                  <li key={a.person_id} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">{a.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[12px]",
                        a.response === "ACCEPTED"
                          ? "text-bamboo-700"
                          : a.response === "DECLINED"
                            ? "text-red-600"
                            : "text-muted",
                      )}
                    >
                      {RESPONSE_LABEL[a.response]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {event.my_response && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-2.5">
            <span className="text-[13px] font-medium">{tr("Bạn tham dự?")}</span>
            <Segmented<Exclude<Response, "PENDING">>
              value={event.my_response === "PENDING" ? undefined : event.my_response}
              onChange={(r) => void run(() => respond(event.id, r), tr("Đã gửi trả lời"))}
              options={[
                { value: "ACCEPTED", label: tr("Tham dự") },
                { value: "TENTATIVE", label: tr("Chưa chắc") },
                { value: "DECLINED", label: tr("Không") },
              ]}
            />
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          {event.source === "event" && (
            <Button
              icon={<Download className="h-4 w-4" />}
              onClick={() => download(`lich-${event.id.slice(0, 8)}.ics`, toIcs([event]))}
            >
              {tr("Tải .ics")}
            </Button>
          )}
          {event.can_edit && (
            <>
              <Popconfirm
                title={tr("Hủy lịch này?")}
                description={
                  event.recurrence !== "NONE"
                    ? tr("Mọi lần lặp đều bị hủy; người được mời nhận thông báo.")
                    : tr("Người được mời nhận thông báo.")
                }
                okText={tr("Hủy lịch")}
                cancelText={tr("Không")}
                okButtonProps={{ danger: true }}
                onConfirm={() => void run(() => cancelEvent(event.id), tr("Đã hủy lịch"))}
              >
                <Button danger>{tr("Hủy lịch")}</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => onEdit(event)}>
                {tr("Sửa")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
