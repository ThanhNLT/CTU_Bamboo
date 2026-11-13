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

import { App, DatePicker, Form, Input, Modal, Radio, Select, Switch, TreeSelect } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

import { tr, trf } from "../../../i18n";
import { PeoplePicker } from "../../chat/components/NewConversation";
import { saveEvent, type Conflict, type Unit } from "../api";
import { KIND_LABEL, type CalEvent, type Kind, type Recurrence } from "../model";

type Values = {
  title: string;
  kind: Kind;
  all_day: boolean;
  range: [Dayjs, Dayjs];
  location?: string;
  description?: string;
  recurrence: Recurrence;
  recur_until?: Dayjs;
  reminder_minutes: number | -1;
  scope: "PERSONAL" | "UNIT";
  org_unit_id?: string;
};

const REMINDERS = [
  { value: -1, label: tr("Không nhắc") },
  { value: 0, label: tr("Khi bắt đầu") },
  { value: 10, label: tr("Trước 10 phút") },
  { value: 30, label: tr("Trước 30 phút") },
  { value: 60, label: tr("Trước 1 giờ") },
  { value: 1440, label: tr("Trước 1 ngày") },
];

const unitTree = (units: Unit[]) => {
  type Node = { value: string; title: string; children: Node[] };
  const byLabel = new Map<string, Node>();
  const roots: Node[] = [];
  for (const u of [...units].sort((a, b) => a.path.split(".").length - b.path.split(".").length)) {
    const labels = u.path.split(".");
    const node: Node = { value: u.id, title: u.name, children: [] };
    byLabel.set(labels.at(-1)!, node);
    const parent = labels.length > 1 ? byLabel.get(labels.at(-2)!) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
};

export const EventForm = ({
  open,
  me,
  units,
  initial,
  start,
  onClose,
  onSaved,
}: {
  open: boolean;
  me: string;
  units: Unit[];
  initial?: CalEvent | null;
  start?: { at: Dayjs; allDay?: boolean } | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [attendees, setAttendees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const allDay = Form.useWatch("all_day", form);
  const recurrence = Form.useWatch("recurrence", form);
  const scope = Form.useWatch("scope", form);
  const tree = useMemo(() => unitTree(units), [units]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const allDayEnd = dayjs(initial.series_end).subtract(1, "day");
      form.setFieldsValue({
        title: initial.title,
        kind: initial.kind,
        all_day: initial.all_day,
        range: [dayjs(initial.series_start), initial.all_day ? allDayEnd : dayjs(initial.series_end)],
        location: initial.location ?? undefined,
        description: initial.description ?? undefined,
        recurrence: initial.recurrence,
        recur_until: initial.recur_until ? dayjs(initial.recur_until) : undefined,
        reminder_minutes: initial.reminder_minutes ?? -1,
        scope: initial.scope,
        org_unit_id: initial.org_unit_id ?? undefined,
      });
      setAttendees(initial.attendees.map((a) => a.person_id));
    } else {
      const at = start?.at ?? dayjs().add(1, "hour").startOf("hour");
      form.resetFields();
      form.setFieldsValue({
        kind: "MEETING",
        all_day: !!start?.allDay,
        range: [at, start?.allDay ? at : at.add(1, "hour")],
        recurrence: "NONE",
        reminder_minutes: 10,
        scope: "PERSONAL",
      });
      setAttendees([]);
    }
  }, [open, initial, start, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const [s, e] = v.range;
    setBusy(true);
    try {
      const out = await saveEvent({
        id: initial?.id,
        title: v.title,
        kind: v.kind,
        all_day: v.all_day,
        starts_at: (v.all_day ? s.startOf("day") : s).format(),
        ends_at: (v.all_day ? e.startOf("day").add(1, "day") : e).format(),
        location: v.location || null,
        description: v.description || null,
        recurrence: v.recurrence,
        recur_until: v.recurrence === "NONE" ? null : v.recur_until?.format("YYYY-MM-DD"),
        reminder_minutes: v.reminder_minutes === -1 ? null : v.reminder_minutes,
        scope: v.scope,
        org_unit_id: v.scope === "UNIT" ? v.org_unit_id : null,
        attendee_ids: attendees,
      });
      message.success(
        initial
          ? tr("Đã lưu lịch")
          : out.invited
            ? trf("Đã tạo lịch, mời {0} người", [out.invited])
            : tr("Đã tạo lịch"),
      );
      if (out.conflicts.length) showConflicts(out.conflicts);
      onSaved();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const showConflicts = (list: Conflict[]) =>
    modal.warning({
      title: tr("Có người trùng lịch"),
      content: (
        <ul className="m-0 mt-2 pl-4 text-[13px]">
          {list.map((c) => (
            <li key={`${c.person_id}-${c.event_id}`}>
              <b>{c.name}</b>: {c.title} ({dayjs(c.starts_at).format("HH:mm DD-MMM")})
            </li>
          ))}
        </ul>
      ),
      okText: tr("Đã hiểu"),
    });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={initial ? tr("Lưu") : tr("Tạo lịch")}
      cancelText={tr("Hủy")}
      confirmLoading={busy}
      title={initial ? tr("Sửa lịch công tác") : tr("Lịch công tác mới")}
      width={620}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} className="mt-3">
        <Form.Item
          name="title"
          label={tr("Tiêu đề")}
          rules={[{ required: true, whitespace: true, message: tr("Cần nhập tiêu đề") }]}
        >
          <Input maxLength={200} placeholder={tr("Ví dụ: Giao ban tuần, Công tác Hải Phòng")} />
        </Form.Item>
        <div className="grid gap-x-4 sm:grid-cols-[1fr_auto]">
          <Form.Item name="kind" label={tr("Loại lịch")}>
            <Select options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          </Form.Item>
          <Form.Item name="all_day" label={tr("Cả ngày")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <Form.Item name="range" label={tr("Thời gian")} rules={[{ required: true, message: tr("Chọn thời gian") }]}>
          <DatePicker.RangePicker
            className="w-full"
            showTime={allDay ? false : { format: "HH:mm", minuteStep: 5 }}
            format={allDay ? "DD-MMM-YYYY" : "DD-MMM-YYYY HH:mm"}
          />
        </Form.Item>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item name="recurrence" label={tr("Lặp lại")}>
            <Select
              options={[
                { value: "NONE", label: tr("Không lặp") },
                { value: "DAILY", label: tr("Hằng ngày") },
                { value: "WEEKLY", label: tr("Hằng tuần") },
                { value: "MONTHLY", label: tr("Hằng tháng") },
              ]}
            />
          </Form.Item>
          {recurrence && recurrence !== "NONE" ? (
            <Form.Item
              name="recur_until"
              label={tr("Lặp đến ngày")}
              rules={[{ required: true, message: tr("Chọn ngày cuối") }]}
            >
              <DatePicker className="w-full" format="DD-MMM-YYYY" />
            </Form.Item>
          ) : (
            <Form.Item name="reminder_minutes" label={tr("Nhắc lịch")}>
              <Select options={REMINDERS} />
            </Form.Item>
          )}
        </div>
        {recurrence && recurrence !== "NONE" && (
          <Form.Item name="reminder_minutes" label={tr("Nhắc lịch")}>
            <Select options={REMINDERS} />
          </Form.Item>
        )}
        <Form.Item name="location" label={tr("Địa điểm")}>
          <Input maxLength={200} placeholder={tr("Phòng họp, địa chỉ hoặc liên kết họp trực tuyến")} />
        </Form.Item>
        <Form.Item label={tr("Người tham dự")}>
          <PeoplePicker me={me} value={attendees} onChange={setAttendees} />
        </Form.Item>
        <Form.Item name="scope" label={tr("Hiển thị cho")}>
          <Radio.Group
            options={[
              { value: "PERSONAL", label: tr("Người tổ chức và người được mời") },
              { value: "UNIT", label: tr("Cả đơn vị (lịch chung)") },
            ]}
          />
        </Form.Item>
        {scope === "UNIT" && (
          <Form.Item
            name="org_unit_id"
            label={tr("Đơn vị")}
            extra={tr("Trưởng đơn vị hoặc người được giao quyền đặt lịch chung mới lưu được")}
            rules={[{ required: true, message: tr("Chọn đơn vị") }]}
          >
            <TreeSelect
              treeData={tree}
              showSearch
              treeNodeFilterProp="title"
              treeDefaultExpandAll
              placeholder={tr("Chọn đơn vị")}
            />
          </Form.Item>
        )}
        <Form.Item name="description" label={tr("Nội dung")}>
          <Input.TextArea rows={3} maxLength={4000} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
