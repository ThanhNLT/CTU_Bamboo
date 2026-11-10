/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { App, Spin } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { ACT_ON_TASK } from "../purchase-requests/queries";
import { ActionWidget } from "./components/ActionWidget";
import { AiSuggestionWidget } from "./components/AiSuggestionWidget";
import { DocumentViewer } from "./components/DocumentViewer";
import { InboxHeader } from "./components/InboxHeader";
import { InfoWidget } from "./components/InfoWidget";
import { TaskDetailHeader } from "./components/TaskDetailHeader";
import { TaskSidebar } from "./components/TaskSidebar";
import type { Decision, InboxScope, InboxTask } from "./types";
import { SLA_HOURS, useInboxTasks } from "./useInboxTasks";
import { tr, trf } from "../../i18n";

const DECISION_TEXT: Record<Decision, { verb: string; done: string; api: "APPROVE" | "RETURN" | "REJECT" }> = {
  approve: { verb: tr("Duyệt"), done: tr("Đã duyệt"), api: "APPROVE" },
  return: { verb: tr("Trả lại"), done: tr("Đã trả lại"), api: "RETURN" },
  reject: { verb: tr("Từ chối"), done: tr("Đã từ chối"), api: "REJECT" },
};

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export const InboxPage = () => {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const { tenant } = useSession();
  const inbox = useInboxTasks();
  const [scope, setScope] = useState<InboxScope>("mine");
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const byDue = (a: InboxTask, b: InboxTask) => a.dueAt.localeCompare(b.dueAt);
  const mine = useMemo(() => inbox.mine.filter((t) => !done.has(t.taskId)).sort(byDue), [inbox.mine, done]);
  const sorted = useMemo(() => inbox.team.filter((t) => !done.has(t.taskId)).sort(byDue), [inbox.team, done]);
  const list = scope === "mine" ? mine : sorted;

  const code = params.get("doc");
  const index = Math.max(
    0,
    list.findIndex((t) => t.code === code),
  );
  const selected = list[index];

  const select = useCallback(
    (t?: InboxTask) => {
      if (!t) return;
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set("doc", t.code);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const goPrev = useCallback(() => select(list[index - 1]), [list, index, select]);
  const goNext = useCallback(() => select(list[index + 1]), [list, index, select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector(".ant-modal-wrap:not([style*='display: none'])")) return;
      const key = e.key.toLowerCase();
      if (key === "j") {
        e.preventDefault();
        goNext();
      } else if (key === "k") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  const decide = (task: InboxTask, decision: Decision, comment: string) => {
    const t = DECISION_TEXT[decision];
    modal.confirm({
      title: `${t.verb} ${task.code}?`,
      content: (
        <div className="space-y-1.5 text-[13px]">
          <p className="font-medium text-ink">{task.title}</p>
          {comment && (
            <p className="text-body">
              {tr("Ý kiến: “")}
              {comment}”
            </p>
          )}
          {task.viaDelegation && (
            <p className="text-body">
              {tr("Bạn đang ")}{" "}
              <b>
                {tr("duyệt thay ")} {task.assignee}
              </b>{" "}
              {tr(" theo ủy quyền; lịch sử sẽ ghi rõ.")}
            </p>
          )}
          <p className="text-muted">{tr("Quyết định được ghi nhật ký kiểm toán và không hoàn tác từ trang này.")}</p>
        </div>
      ),
      okText: t.verb,
      cancelText: tr("Hủy"),
      okButtonProps: decision === "reject" ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await request(ACT_ON_TASK, { task: task.taskId, decision: t.api, note: comment || null });
        } catch (e) {
          message.error((e as Error).message);
          return;
        }
        select(list[index + 1] ?? list[index - 1]);
        setDone((prev) => new Set(prev).add(task.taskId));
        message.success(`${t.done} ${task.code}.`);
      },
    });
  };

  const readOnly =
    selected && !selected.actionable
      ? trf("Việc của {0} — bạn chỉ xem, không quyết định thay.", [selected.assignee])
      : undefined;

  if (inbox.loading && inbox.team.length === 0) {
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <InboxHeader
        mineCount={mine.length}
        teamCount={sorted.length}
        scope={scope}
        onScopeChange={setScope}
        slaHours={SLA_HOURS}
        error={inbox.error}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(240px,3fr)_minmax(0,7fr)]">
        <TaskSidebar
          className="max-h-[360px] xl:sticky xl:top-[84px] xl:max-h-[calc(100dvh-108px)]"
          tasks={list}
          selectedId={selected?.id}
          onSelect={(id) => select(list.find((t) => t.id === id))}
          me={tenant.full_name}
        />

        {selected ? (
          <div className="flex min-w-0 flex-col gap-4">
            <TaskDetailHeader
              task={selected}
              onPrev={goPrev}
              onNext={goNext}
              hasPrev={index > 0}
              hasNext={index < list.length - 1}
              to={selected.to}
            />
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(260px,35fr)]">
              <DocumentViewer
                className="lg:sticky lg:top-[84px] lg:h-[calc(100dvh-260px)] lg:min-h-[520px]"
                attachments={selected.attachments}
                preview={selected.preview}
              />
              <div className="flex min-w-0 flex-col gap-4">
                <InfoWidget info={selected.info} />
                <AiSuggestionWidget suggestion={selected.ai} />
                <ActionWidget
                  taskKey={selected.id}
                  disabledReason={readOnly}
                  onDecide={(d, c) => decide(selected, d, c)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[13px] text-muted shadow-card">
            {scope === "mine"
              ? tr("Không còn việc nào chờ bạn. Hết việc rồi!")
              : tr("Nhóm không còn việc nào đang chờ.")}
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxPage;
