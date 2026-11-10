/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { Alert, Empty, Segmented, Spin } from "antd";
import dayjs from "dayjs";
import { FolderKanban, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useSession } from "../../auth/useSession";
import { SearchInput } from "../../components/ui";
import { primaryButtonClass } from "../../components/ui/buttons";
import { LiveBadge } from "../../live/LiveBadge";
import { useLiveTopics } from "../../live/useLive";
import { tr, trf } from "../../i18n";
import { cn } from "../../utils/cn";
import { fold } from "../chat/text";
import { fetchProjects, STATUS_LABEL } from "./api";
import { ProjectForm } from "./components/ProjectForm";
import type { ProjectRow } from "./types";

type Filter = "open" | "all" | "DONE";

const health = (p: ProjectRow) => {
  if (p.progress == null || p.planned == null || p.planned === 0) return p.late_tasks ? "AMBER" : "GREEN";
  const spi = p.progress / p.planned;
  if (spi >= 0.95 && !p.late_tasks) return "GREEN";
  return spi < 0.8 ? "RED" : "AMBER";
};
const HEALTH_BAR = { GREEN: "bg-bamboo-500", AMBER: "bg-amber-500", RED: "bg-red-500" } as const;

/** Danh sách dự án người dùng xem được (ADR #66): tiến độ thực hiện so với kế hoạch, việc trễ. */
export const ProjectListPage = () => {
  const { tenant } = useSession();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchProjects());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const live = useLiveTopics(["project"], () => void load());

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return (rows ?? []).filter(
      (p) =>
        (filter === "all" || (filter === "DONE" ? p.status === "DONE" : !["DONE", "CANCELLED"].includes(p.status))) &&
        (!needle || fold(`${p.code} ${p.name} ${p.manager.full_name}`).includes(needle)),
    );
  }, [rows, filter, q]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bamboo-50 text-bamboo-700"
            aria-hidden
          >
            <FolderKanban className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {tr("Dự án và kế hoạch")}
            </h1>
            <p className="mt-1 text-[13px] text-muted">
              {tr("Văn bản kế hoạch chi tiết, WBS và sơ đồ Gantt, theo dõi và báo cáo tiến độ theo kỳ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge connected={live.connected} changedAt={live.changedAt} />
          <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {tr("Dự án mới")}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: tr("Đang làm") },
            { value: "DONE", label: tr("Hoàn thành") },
            { value: "all", label: tr("Tất cả") },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={tr("Tìm theo mã, tên, người quản lý")}
          className="w-full sm:w-[320px]"
        />
      </div>
      {error && <Alert type="error" showIcon message={tr("Không tải được dự án")} description={error} />}
      {!rows && !error && <Spin className="m-10 block" />}
      {rows && shown.length === 0 && <Empty description={tr("Chưa có dự án nào bạn tham gia hoặc được xem")} />}
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((p) => {
          const h = health(p);
          const left = dayjs(p.end_date).diff(dayjs().startOf("day"), "day");
          return (
            <Link
              key={p.id}
              to={`/p/projects/${p.id}`}
              className="group flex flex-col gap-2.5 rounded-2xl border bg-surface p-4 text-ink! shadow-card transition-colors hover:border-bamboo-300"
            >
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span className="font-mono font-semibold text-bamboo-700">{p.code}</span>
                <span>·</span>
                <span>{STATUS_LABEL[p.status]}</span>
                {!!p.late_tasks && (
                  <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">
                    {trf("{0} việc trễ", [p.late_tasks])}
                  </span>
                )}
              </div>
              <h2 className="m-0 line-clamp-2 text-[16px] font-semibold leading-snug group-hover:text-bamboo-700">
                {p.name}
              </h2>
              <div className="text-[12.5px] text-muted">
                {p.org_unit.name} · {p.manager.full_name}
              </div>
              <div>
                <div className="relative h-2 overflow-hidden rounded-full bg-black/[0.06]" aria-hidden>
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-full", HEALTH_BAR[h])}
                    style={{ width: `${p.progress ?? 0}%` }}
                  />
                  <span
                    className="absolute inset-y-[-2px] w-0.5 bg-ink/70"
                    style={{ left: `${Math.min(p.planned ?? 0, 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11.5px] text-muted">
                  <span>
                    {trf("Thực hiện {0}% · kế hoạch {1}%", [Math.round(p.progress ?? 0), Math.round(p.planned ?? 0)])}
                  </span>
                  <span>
                    {dayjs(p.start_date).format("DD/MM/YY")} – {dayjs(p.end_date).format("DD/MM/YY")}
                    {p.status !== "DONE" && left >= 0 && ` · ${trf("còn {0} ngày", [left])}`}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <ProjectForm
        open={creating}
        me={{ id: tenant.person_id, name: tenant.full_name }}
        onClose={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          navigate(`/p/projects/${id}`);
        }}
      />
    </div>
  );
};

export default ProjectListPage;
