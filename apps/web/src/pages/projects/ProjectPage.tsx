// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App, Button, Dropdown, Segmented, Spin, Switch, Tooltip } from "antd";
import dayjs from "dayjs";
import {
  ArrowLeft,
  Flag,
  FileDown,
  FolderKanban,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { useSession } from "../../auth/useSession";
import { Panel } from "../../components/ui";
import { LiveBadge } from "../../live/LiveBadge";
import { useLiveTopics } from "../../live/useLive";
import { tr, trf } from "../../i18n";
import { cn } from "../../utils/cn";
import { formatMoney } from "../../utils/format";
import {
  fetchDetail,
  HEALTH_LABEL,
  HEALTH_STYLE,
  planPdf,
  ROLE_LABEL,
  saveTask,
  setBaseline,
  STATUS_LABEL,
} from "./api";
import { Gantt, type Zoom } from "./components/Gantt";
import { MembersModal } from "./components/MembersModal";
import { ProjectForm } from "./components/ProjectForm";
import { Reports } from "./components/Reports";
import { TaskDrawer } from "./components/TaskDrawer";
import type { Detail, Task } from "./types";

type Tab = "gantt" | "plan" | "reports";

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

const Stat = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) => (
  <div className="min-w-0 rounded-2xl border bg-surface px-4 py-3 shadow-card">
    <div className="text-[12px] font-medium text-muted">{label}</div>
    <div className={cn("mt-0.5 text-[22px] font-semibold tabular-nums tracking-[-0.01em] text-ink", tone)}>{value}</div>
    {hint && <div className="truncate text-[11.5px] text-muted">{hint}</div>}
  </div>
);

/** Chi tiết dự án (ADR #66): chỉ số tiến độ, sơ đồ Gantt, văn bản kế hoạch, báo cáo tiến độ; tự cập nhật giữa các thiết bị. */
export const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const me = tenant.person_id;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("gantt");
  const [zoom, setZoom] = useState<Zoom>("week");
  const [critical, setCritical] = useState(true);
  const [baseline, setShowBaseline] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [drawer, setDrawer] = useState<{ start?: string; parent_id?: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await fetchDetail(id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  const live = useLiveTopics(["project"], () => void load());

  if (error) return <Alert type="error" showIcon message={tr("Không mở được dự án")} description={error} />;
  if (!detail) return <Spin className="m-10 block" />;

  const { project: p, stats: s } = detail;
  const daysLeft = dayjs(p.end_date).diff(dayjs().startOf("day"), "day");
  const health = s.suggested_health;

  const move = async (t: Task, start: string, end: string) => {
    try {
      const out = await saveTask({ id: t.id, start_date: start, end_date: end });
      if (out.shifted) message.info(trf("Đã tự dời {0} công việc phụ thuộc", [out.shifted]));
      await load();
    } catch (e) {
      message.error((e as Error).message);
      await load();
    }
  };

  const openPdf = async () => {
    const hide = message.loading(tr("Đang dựng văn bản kế hoạch…"), 0);
    try {
      window.open(await planPdf(p.id), "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      hide();
    }
  };

  const baselineNow = () =>
    modal.confirm({
      title: tr("Chốt đường cơ sở?"),
      content: tr(
        "Ngày hiện tại của mọi công việc thành mốc so sánh; sau này kế hoạch đổi sẽ thấy chậm/sớm bao nhiêu ngày.",
      ),
      okText: tr("Chốt"),
      cancelText: tr("Hủy"),
      onOk: async () => {
        await setBaseline(p.id);
        message.success(tr("Đã chốt đường cơ sở"));
        await load();
      },
    });

  const sections: [string, string | null][] = [
    [tr("Mục tiêu"), p.objective],
    [tr("Phạm vi"), p.scope],
    [tr("Sản phẩm bàn giao"), p.deliverables],
    [tr("Phương pháp triển khai"), p.approach],
    [tr("Rủi ro và biện pháp"), p.risks],
    [tr("Các bên liên quan"), p.stakeholders],
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link
          to="/p/projects"
          className="mt-1 grid h-9 w-9 place-items-center rounded-full hover:bg-bamboo-50"
          aria-label={tr("Danh sách dự án")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bamboo-50 text-bamboo-700"
          aria-hidden
        >
          <FolderKanban className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <span className="font-mono font-semibold text-bamboo-700">{p.code}</span>
            <span>·</span>
            <span>{STATUS_LABEL[p.status]}</span>
            <span>·</span>
            <span>{p.org_unit_name}</span>
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", HEALTH_STYLE[health])}>
              {HEALTH_LABEL[health]}
            </span>
          </div>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink">{p.name}</h1>
          <p className="m-0 text-[12.5px] text-muted">
            {trf("Quản lý: {0} · {1} – {2}", [
              p.manager_name,
              dayjs(p.start_date).format("DD/MM/YYYY"),
              dayjs(p.end_date).format("DD/MM/YYYY"),
            ])}
            {p.budget != null && ` · ${trf("Ngân sách {0}", [formatMoney(p.budget)])}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveBadge connected={live.connected} changedAt={live.changedAt} />
          {p.conversation_id && (
            <Button
              icon={<MessagesSquare className="h-4 w-4" />}
              onClick={() => navigate(`/h/chat/${p.conversation_id}`)}
            >
              {tr("Nhóm dự án")}
            </Button>
          )}
          <Button icon={<FileDown className="h-4 w-4" />} onClick={() => void openPdf()}>
            {tr("Văn bản kế hoạch")}
          </Button>
          {detail.can_manage && (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  {
                    key: "edit",
                    icon: <Pencil className="h-4 w-4" />,
                    label: tr("Sửa dự án và kế hoạch"),
                    onClick: () => setEditing(true),
                  },
                  {
                    key: "members",
                    icon: <Users className="h-4 w-4" />,
                    label: tr("Thành viên"),
                    onClick: () => setMembersOpen(true),
                  },
                  {
                    key: "baseline",
                    icon: <Flag className="h-4 w-4" />,
                    label: tr("Chốt đường cơ sở"),
                    onClick: baselineNow,
                  },
                ],
              }}
            >
              <Button icon={<MoreHorizontal className="h-4 w-4" />} aria-label={tr("Thao tác khác")} />
            </Dropdown>
          )}
        </div>
      </div>

      {detail.warnings.map((w) => (
        <Alert key={w} type="warning" showIcon message={w} />
      ))}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat
          label={tr("Thực hiện")}
          value={pct(s.actual_pct)}
          hint={trf("{0}/{1} việc xong", [s.done_tasks, s.total_tasks])}
        />
        <Stat label={tr("Kế hoạch tới hôm nay")} value={pct(s.planned_pct)} />
        <Stat
          label={tr("Chỉ số tiến độ (SPI)")}
          value={s.spi == null ? "—" : Number(s.spi).toFixed(2)}
          hint={
            s.spi == null
              ? tr("Chưa đến ngày bắt đầu")
              : s.spi >= 1
                ? tr("Đúng hoặc vượt kế hoạch")
                : tr("Chậm so với kế hoạch")
          }
          tone={s.spi != null && s.spi < 0.8 ? "text-red-600" : undefined}
        />
        <Stat
          label={tr("Việc trễ hạn")}
          value={String(s.late_tasks)}
          tone={s.late_tasks ? "text-red-600" : undefined}
        />
        <Stat
          label={tr("Còn lại")}
          value={daysLeft >= 0 ? trf("{0} ngày", [daysLeft]) : trf("Quá {0} ngày", [-daysLeft])}
          hint={
            p.baseline_at
              ? trf("Đường cơ sở chốt {0}", [dayjs(p.baseline_at).format("DD/MM/YYYY")])
              : tr("Chưa chốt đường cơ sở")
          }
        />
      </div>

      <div className="max-w-full self-start overflow-x-auto">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "gantt", label: tr("Sơ đồ Gantt") },
            { value: "plan", label: tr("Văn bản kế hoạch") },
            { value: "reports", label: trf("Báo cáo tiến độ ({0})", [detail.reports.length]) },
          ]}
        />
      </div>

      {tab === "gantt" && (
        <section className="flex h-[calc(100dvh-14rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border bg-surface shadow-card [--gantt-left:200px] md:[--gantt-left:440px]">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            {detail.can_manage && (
              <Button
                type="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setTask(null);
                  setDrawer({ start: dayjs().isBefore(p.start_date) ? p.start_date : dayjs().format("YYYY-MM-DD") });
                }}
              >
                {tr("Công việc")}
              </Button>
            )}
            <Segmented<Zoom>
              size="small"
              value={zoom}
              onChange={setZoom}
              options={[
                { value: "day", label: tr("Ngày") },
                { value: "week", label: tr("Tuần") },
                { value: "month", label: tr("Tháng") },
              ]}
            />
            <label className="flex items-center gap-1.5 text-[12.5px]">
              <Switch size="small" checked={critical} onChange={setCritical} />
              {tr("Đường găng")}
            </label>
            <Tooltip title={p.baseline_at ? undefined : tr("Chưa chốt đường cơ sở")}>
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <Switch size="small" checked={baseline} onChange={setShowBaseline} disabled={!p.baseline_at} />
                {tr("Đường cơ sở")}
              </label>
            </Tooltip>
            {detail.can_manage && (
              <span className="ml-auto text-[11.5px] text-muted max-md:hidden">
                {tr("Kéo thanh để dời, kéo mép phải để đổi ngày kết thúc; việc phụ thuộc tự dời theo")}
              </span>
            )}
          </div>
          {detail.tasks.length === 0 ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-muted">
              {detail.can_manage ? tr('Chưa có công việc. Bấm "Công việc" để lập WBS.') : tr("Chưa có công việc.")}
            </div>
          ) : (
            <Gantt
              tasks={detail.tasks}
              deps={detail.dependencies}
              from={p.start_date}
              to={p.end_date}
              zoom={zoom}
              canEdit={detail.can_manage}
              showCritical={critical}
              showBaseline={baseline && !!p.baseline_at}
              onOpen={(t) => {
                setTask(t);
                setDrawer({});
              }}
              onMove={(t, s2, e2) => void move(t, s2, e2)}
            />
          )}
        </section>
      )}

      {tab === "plan" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <Panel
            title={tr("Văn bản kế hoạch chi tiết")}
            extra={
              <Button icon={<FileDown className="h-4 w-4" />} onClick={() => void openPdf()}>
                PDF
              </Button>
            }
          >
            {sections.some(([, v]) => v) ? (
              sections
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <section key={k} className="mb-4 last:mb-0">
                    <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{k}</h3>
                    <p className="m-0 whitespace-pre-line text-[14px] leading-relaxed text-body">{v}</p>
                  </section>
                ))
            ) : (
              <p className="m-0 text-[13px] text-muted">
                {detail.can_manage
                  ? tr('Chưa viết nội dung kế hoạch. Mở "Sửa dự án và kế hoạch" để bổ sung.')
                  : tr("Chưa có nội dung kế hoạch.")}
              </p>
            )}
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title={trf("Thành viên ({0})", [detail.members.length])}>
              <ul className="m-0 list-none p-0">
                {detail.members.map((m) => (
                  <li
                    key={m.person_id}
                    className="flex justify-between gap-2 border-b border-line py-1.5 text-[13px] last:border-0"
                  >
                    <span className="truncate">{m.full_name}</span>
                    <span className="shrink-0 text-muted">{ROLE_LABEL[m.role]}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={tr("Các mốc chính")}>
              <ul className="m-0 list-none p-0">
                {detail.tasks
                  .filter((t) => t.milestone)
                  .map((t) => (
                    <li
                      key={t.id}
                      className="flex justify-between gap-2 border-b border-line py-1.5 text-[13px] last:border-0"
                    >
                      <span className="truncate">◆ {t.name}</span>
                      <span
                        className={cn(
                          "shrink-0",
                          t.progress === 100 ? "text-bamboo-700" : t.late ? "text-red-600" : "text-muted",
                        )}
                      >
                        {dayjs(t.start_date).format("DD/MM/YYYY")}
                      </span>
                    </li>
                  ))}
                {!detail.tasks.some((t) => t.milestone) && (
                  <li className="text-[13px] text-muted">{tr("Chưa đặt mốc")}</li>
                )}
              </ul>
            </Panel>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <Reports
          projectId={p.id}
          reports={detail.reports}
          stats={s}
          canManage={detail.can_manage}
          onCreated={() => void load()}
        />
      )}

      <TaskDrawer
        open={!!drawer}
        projectId={p.id}
        task={task}
        tasks={detail.tasks}
        deps={detail.dependencies}
        members={detail.members}
        me={me}
        canManage={detail.can_manage}
        defaults={drawer?.start ? { start: drawer.start, parent_id: drawer.parent_id } : undefined}
        onClose={() => setDrawer(null)}
        onSaved={() => {
          setDrawer(null);
          void load();
        }}
      />
      <ProjectForm
        open={editing}
        me={{ id: me, name: tenant.full_name }}
        initial={p}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void load();
        }}
      />
      <MembersModal
        open={membersOpen}
        projectId={p.id}
        managerId={p.manager_id}
        me={me}
        members={detail.members}
        onClose={() => setMembersOpen(false)}
        onSaved={() => {
          setMembersOpen(false);
          void load();
        }}
      />
    </div>
  );
};

export default ProjectPage;
