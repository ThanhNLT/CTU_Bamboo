// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { tr, trf } from "../../../i18n";
import { deleteTask, reorderTask, saveTask } from "../api";
import type { Dependency, Member, Task } from "../types";

type Values = {
  name: string;
  parent_id?: string | null;
  milestone: boolean;
  range?: [Dayjs, Dayjs];
  day?: Dayjs;
  progress: number;
  assignee_id?: string | null;
  description?: string;
};

/** Thêm / sửa công việc: người quản lý sửa mọi thứ; người phụ trách chỉ cập nhật % hoàn thành của việc mình. */
export const TaskDrawer = ({
  open,
  projectId,
  task,
  tasks,
  deps,
  members,
  me,
  canManage,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  task: Task | null;
  tasks: Task[];
  deps: Dependency[];
  members: Member[];
  me: string;
  canManage: boolean;
  defaults?: { start: string; parent_id?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [preds, setPreds] = useState<{ id: string; lag_days: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const milestone = Form.useWatch("milestone", form);
  const own = !!task && task.assignee_id === me;
  const editable = canManage;
  const progressOnly = !canManage && own && !task?.has_children;

  // Không cho chọn làm cha hay việc trước: chính nó và cây con của nó
  const blocked = useMemo(() => {
    const out = new Set<string>();
    if (!task) return out;
    out.add(task.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of tasks) {
        if (t.parent_id && out.has(t.parent_id) && !out.has(t.id)) {
          out.add(t.id);
          grew = true;
        }
      }
    }
    return out;
  }, [task, tasks]);

  useEffect(() => {
    if (!open) return;
    if (task) {
      form.setFieldsValue({
        name: task.name,
        parent_id: task.parent_id,
        milestone: task.milestone,
        range: [dayjs(task.start_date), dayjs(task.end_date)],
        day: dayjs(task.start_date),
        progress: task.progress,
        assignee_id: task.assignee_id,
        description: task.description ?? undefined,
      });
      setPreds(
        deps.filter((d) => d.successor_id === task.id).map((d) => ({ id: d.predecessor_id, lag_days: d.lag_days })),
      );
    } else {
      const s = dayjs(defaults?.start ?? undefined);
      form.resetFields();
      form.setFieldsValue({
        milestone: false,
        progress: 0,
        parent_id: defaults?.parent_id ?? null,
        range: [s, s.add(4, "day")],
        day: s,
      });
      setPreds([]);
    }
  }, [open, task, deps, defaults, form]);

  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try {
      const body = progressOnly
        ? { id: task!.id, progress: v.progress }
        : {
            id: task?.id,
            project_id: projectId,
            name: v.name,
            parent_id: v.parent_id ?? null,
            milestone: v.milestone,
            start_date: (v.milestone ? v.day! : v.range![0]).format("YYYY-MM-DD"),
            end_date: (v.milestone ? v.day! : v.range![1]).format("YYYY-MM-DD"),
            progress: task?.has_children ? task.progress : v.progress,
            assignee_id: v.assignee_id ?? null,
            description: v.description || null,
            predecessors: preds.filter((p) => p.id),
          };
      const out = await saveTask(body);
      message.success(
        out.shifted ? trf("Đã lưu, tự dời {0} công việc phía sau", [out.shifted]) : tr("Đã lưu công việc"),
      );
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const options = tasks.filter((t) => !blocked.has(t.id)).map((t) => ({ value: t.id, label: `${t.wbs} ${t.name}` }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={task ? `${task.wbs} ${task.name}` : tr("Công việc mới")}
      extra={
        (editable || progressOnly) && (
          <Button type="primary" loading={busy} onClick={() => void submit()}>
            {tr("Lưu")}
          </Button>
        )
      }
    >
      {task && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {task.critical && !task.has_children && <Tag color="red">{tr("Đường găng")}</Tag>}
          {task.late && <Tag color="volcano">{tr("Trễ hạn")}</Tag>}
          {!task.critical && <Tag>{trf("Dự trữ {0} ngày", [task.slack_days])}</Tag>}
          {task.slip_days != null && task.slip_days !== 0 && (
            <Tag color={task.slip_days > 0 ? "orange" : "green"}>
              {task.slip_days > 0
                ? trf("Chậm {0} ngày so với đường cơ sở", [task.slip_days])
                : trf("Sớm {0} ngày so với đường cơ sở", [-task.slip_days])}
            </Tag>
          )}
        </div>
      )}
      <Form form={form} layout="vertical" requiredMark={false} disabled={!editable && !progressOnly}>
        <Form.Item
          name="name"
          label={tr("Tên công việc")}
          rules={[{ required: true, whitespace: true, message: tr("Cần tên công việc") }]}
        >
          <Input maxLength={300} disabled={progressOnly} />
        </Form.Item>
        <Form.Item name="parent_id" label={tr("Thuộc công việc")}>
          <Select
            allowClear
            options={options}
            placeholder={tr("(Cấp cao nhất)")}
            disabled={progressOnly}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item name="milestone" label={tr("Mốc (không kéo dài)")} valuePropName="checked">
          <Switch disabled={progressOnly || task?.has_children} />
        </Form.Item>
        {milestone ? (
          <Form.Item name="day" label={tr("Ngày")} rules={[{ required: true }]}>
            <DatePicker className="w-full" format="DD/MM/YYYY" disabled={progressOnly || task?.has_children} />
          </Form.Item>
        ) : (
          <Form.Item
            name="range"
            label={tr("Bắt đầu – kết thúc")}
            rules={[{ required: true }]}
            extra={task?.has_children ? tr("Công việc tổng hợp lấy ngày từ các việc con") : undefined}
          >
            <DatePicker.RangePicker
              className="w-full"
              format="DD/MM/YYYY"
              disabled={progressOnly || task?.has_children}
            />
          </Form.Item>
        )}
        <Form.Item name="progress" label={tr("% hoàn thành")}>
          <Slider
            marks={{ 0: "0", 50: "50", 100: "100" }}
            step={5}
            disabled={task?.has_children || (!editable && !progressOnly)}
          />
        </Form.Item>
        <Form.Item name="assignee_id" label={tr("Người phụ trách")}>
          <Select
            allowClear
            disabled={progressOnly}
            options={members
              .filter((m) => m.role !== "VIEWER")
              .map((m) => ({ value: m.person_id, label: m.full_name }))}
            placeholder={tr("Chọn thành viên dự án")}
          />
        </Form.Item>
        <Form.Item label={tr("Làm sau công việc (phụ thuộc kết thúc → bắt đầu)")}>
          <div className="flex flex-col gap-2">
            {preds.map((p, i) => (
              <Space.Compact key={i} className="w-full">
                <Select
                  className="min-w-0 flex-1"
                  value={p.id || undefined}
                  disabled={progressOnly}
                  showSearch
                  optionFilterProp="label"
                  options={options}
                  placeholder={tr("Công việc trước")}
                  onChange={(id) => setPreds((prev) => prev.map((x, j) => (j === i ? { ...x, id } : x)))}
                />
                <Tooltip title={tr("Độ trễ (ngày) sau khi việc trước kết thúc; số âm là gối đầu")}>
                  <InputNumber
                    className="w-[96px]"
                    value={p.lag_days}
                    min={-365}
                    max={365}
                    disabled={progressOnly}
                    suffix={tr("ngày")}
                    onChange={(n) =>
                      setPreds((prev) => prev.map((x, j) => (j === i ? { ...x, lag_days: Number(n) || 0 } : x)))
                    }
                  />
                </Tooltip>
                <Button
                  disabled={progressOnly}
                  icon={<Trash2 className="h-4 w-4" />}
                  aria-label={tr("Bỏ phụ thuộc")}
                  onClick={() => setPreds((prev) => prev.filter((_, j) => j !== i))}
                />
              </Space.Compact>
            ))}
            {editable && (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setPreds((prev) => [...prev, { id: "", lag_days: 0 }])}
              >
                {tr("Thêm việc trước")}
              </Button>
            )}
          </div>
        </Form.Item>
        <Form.Item name="description" label={tr("Mô tả")}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} disabled={progressOnly} />
        </Form.Item>
      </Form>
      {task && editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Tooltip title={tr("Lên trên")}>
            <Button icon={<ArrowUp className="h-4 w-4" />} onClick={() => void run(() => reorderTask(task.id, "up"))} />
          </Tooltip>
          <Tooltip title={tr("Xuống dưới")}>
            <Button
              icon={<ArrowDown className="h-4 w-4" />}
              onClick={() => void run(() => reorderTask(task.id, "down"))}
            />
          </Tooltip>
          <Tooltip title={tr("Thụt vào (làm việc con của việc liền trên)")}>
            <Button
              icon={<IndentIncrease className="h-4 w-4" />}
              onClick={() => void run(() => reorderTask(task.id, "indent"))}
            />
          </Tooltip>
          <Tooltip title={tr("Lùi ra một cấp")}>
            <Button
              icon={<IndentDecrease className="h-4 w-4" />}
              onClick={() => void run(() => reorderTask(task.id, "outdent"))}
            />
          </Tooltip>
          <Popconfirm
            title={task.has_children ? tr("Xóa công việc này và mọi việc con?") : tr("Xóa công việc này?")}
            okText={tr("Xóa")}
            cancelText={tr("Hủy")}
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              void run(async () => {
                await deleteTask(task.id);
                onClose();
              })
            }
          >
            <Button danger className="ml-auto" icon={<Trash2 className="h-4 w-4" />}>
              {tr("Xóa")}
            </Button>
          </Popconfirm>
        </div>
      )}
    </Drawer>
  );
};
