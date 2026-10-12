// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hộp việc (Quy trình số): trái ~30% danh sách việc theo hạn SLA; phải ~70% gồm đầu việc, trình xem tệp
// (~65%) và cột widget (~35%: Thông tin, Gợi ý của trợ lý, Ý kiến & thao tác). Phím J/K chuyển việc.
// ?code=HS-... trên URL chọn sẵn một việc (liên kết từ Trang chủ, trang Hồ sơ). Dữ liệu minh họa ở ./mock.
import { App } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ActionWidget } from "./components/ActionWidget";
import { AiSuggestionWidget } from "./components/AiSuggestionWidget";
import { DocumentViewer } from "./components/DocumentViewer";
import { InboxHeader } from "./components/InboxHeader";
import { InfoWidget } from "./components/InfoWidget";
import { TaskDetailHeader } from "./components/TaskDetailHeader";
import { TaskSidebar } from "./components/TaskSidebar";
import { MOCK_INITIAL_CODE, MOCK_ME, MOCK_TASKS } from "./mock";
import type { Decision, InboxScope, InboxTask } from "./types";

const DECISION_TEXT: Record<Decision, { verb: string; done: string }> = {
  approve: { verb: "Duyệt", done: "Đã duyệt" },
  return: { verb: "Trả lại", done: "Đã trả lại" },
  reject: { verb: "Từ chối", done: "Đã từ chối" },
};

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export const InboxPage = () => {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<InboxTask[]>(MOCK_TASKS);
  const [scope, setScope] = useState<InboxScope>("mine");

  const sorted = useMemo(() => [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [tasks]);
  const mine = useMemo(() => sorted.filter((t) => t.assignee === MOCK_ME), [sorted]);
  const list = scope === "mine" ? mine : sorted;

  // Việc đang chọn nằm trên URL (?code=) để chia sẻ/quay lại được; mặc định là việc gấp nhất.
  const code = params.get("code") ?? MOCK_INITIAL_CODE;
  const index = Math.max(0, list.findIndex((t) => t.code === code));
  const selected = list[index];

  const select = useCallback(
    (t?: InboxTask) => {
      if (!t) return;
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("code", t.code);
        return next;
      }, { replace: true });
    },
    [setParams],
  );

  const goPrev = useCallback(() => select(list[index - 1]), [list, index, select]);
  const goNext = useCallback(() => select(list[index + 1]), [list, index, select]);

  // Phím tắt J (kế tiếp) / K (trước) — bỏ qua khi đang gõ chữ hoặc có hộp thoại đang mở.
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
          {comment && <p className="text-body">Ý kiến: “{comment}”</p>}
          <p className="text-muted">Quyết định được ghi nhật ký kiểm toán và không hoàn tác từ trang này.</p>
        </div>
      ),
      okText: t.verb,
      cancelText: "Hủy",
      okButtonProps: decision === "reject" ? { danger: true } : undefined,
      onOk: () => {
        // Chuyển sang việc kế tiếp (hoặc việc trước nếu đang ở cuối) rồi bỏ việc đã xử lý khỏi danh sách.
        select(list[index + 1] ?? list[index - 1]);
        setTasks((prev) => prev.filter((x) => x.id !== task.id));
        message.success(`${t.done} ${task.code}.`);
      },
    });
  };

  const readOnly = selected && selected.assignee !== MOCK_ME
    ? `Việc của ${selected.assignee} — bạn chỉ xem, không quyết định thay.`
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <InboxHeader mineCount={mine.length} teamCount={sorted.length} scope={scope} onScopeChange={setScope} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(240px,3fr)_minmax(0,7fr)]">
        <TaskSidebar
          className="max-h-[360px] xl:sticky xl:top-[84px] xl:max-h-[calc(100dvh-108px)]"
          tasks={list}
          selectedId={selected?.id}
          onSelect={(id) => select(list.find((t) => t.id === id))}
          me={MOCK_ME}
        />

        {selected ? (
          <div className="flex min-w-0 flex-col gap-4">
            <TaskDetailHeader
              task={selected}
              onPrev={goPrev}
              onNext={goNext}
              hasPrev={index > 0}
              hasNext={index < list.length - 1}
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
          <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center text-[13px] text-muted shadow-card">
            Không còn việc nào. Hết việc rồi!
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxPage;
