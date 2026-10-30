// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Input, Modal, Radio, Segmented, Select, Spin } from "antd";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import {
  deleteProcess,
  createAutomationWebhook,
  draftRegulation,
  disableAutomation,
  enableAutomation,
  getProcess,
  getProcessVersion,
  listProcesses,
  publishProcess,
  requestChange,
  resolveChange,
  runSandbox,
  saveProcess,
  setAutomationEvents,
  startAutomation,
  validateProcess,
} from "./api";
import type { BpmnEditorHandle } from "./components/BpmnEditor";
import { AutomationTab } from "./components/AutomationTab";
import { ChangeRequestsTab } from "./components/ChangeRequestsTab";
import { FormsTab } from "./components/FormsTab";
import { FromDocumentModal } from "./components/FromDocumentModal";
import { ProcessHeader } from "./components/ProcessHeader";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { RegulationTab } from "./components/RegulationTab";
import { RunsTab } from "./components/RunsTab";
import { SandboxModal, type SandboxInput } from "./components/SandboxModal";
import { SidebarTools } from "./components/SidebarTools";
import { newProcessXml } from "./flowable-moddle";
import type {
  Audience,
  DesignUnit,
  FormDef,
  Issue,
  ProcessDetail,
  ProcessSummary,
  SandboxRun,
  SelectedElement,
} from "./types";
import { downloadText, keyFromName, userTasksOf, type UserTaskRef } from "./utils";

const BpmnEditor = lazy(() => import("./components/BpmnEditor"));

type Tab = "process" | "forms" | "runs" | "requests" | "auto" | "rules";

const AUDIENCE_OPTIONS: { value: Audience; label: string; hint: string }[] = [
  { value: "UNIT", label: "Phòng ban", hint: "Đơn vị sở hữu quy trình và các đơn vị con" },
  { value: "COMPANY", label: "Cả công ty", hint: "Mọi người trong công ty chứa đơn vị này" },
  { value: "GROUP", label: "Toàn tập đoàn", hint: "Công ty mẹ và tất cả công ty con" },
];

export const ProcessDesignPage = () => {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<{ canDesign: boolean; designUnits: DesignUnit[]; models: ProcessSummary[] }>();
  const [detail, setDetail] = useState<ProcessDetail>();
  const [forms, setForms] = useState<FormDef[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<SelectedElement>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "validate" | "sandbox" | "publish">();
  const [tab, setTab] = useState<Tab>("process");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [sandboxTasks, setSandboxTasks] = useState<UserTaskRef[]>();
  const [meta, setMeta] = useState<{ name: string; description: string }>();
  const [newUnit, setNewUnit] = useState<string>();
  const [publishing, setPublishing] = useState<{ audience: Audience; note: string }>();
  const [changing, setChanging] = useState<string>();
  const [fromDoc, setFromDoc] = useState(false);
  const editor = useRef<BpmnEditorHandle>(null);
  const activeId = params.get("id") ?? undefined;
  const access = detail?.access ?? "view";
  const canDesign = access === "design";

  useEffect(() => {
    if (access === "view" || (!canDesign && tab === "forms")) setTab("process");
  }, [access, canDesign, tab]);

  const loadList = useCallback(
    () =>
      listProcesses()
        .then(setList)
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  const loadDetail = useCallback(
    (id: string) =>
      getProcess(id)
        .then((d) => {
          setDetail(d);
          setForms(d.forms);
          setIssues(d.issues);
          setDirty(false);
        })
        .catch((e: Error) => message.error(e.message)),
    [message],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    const id = activeId ?? list?.models[0]?.id;
    if (id && id !== detail?.id) {
      editor.current?.highlight([]);
      void loadDetail(id);
    }
  }, [activeId, list, detail?.id, loadDetail]);

  const select = (id: string) => {
    const go = () => setParams({ id });
    if (!dirty) return go();
    modal.confirm({
      title: "Bỏ thay đổi chưa lưu?",
      content: "Bản nháp đang sửa chưa được lưu.",
      okText: "Bỏ thay đổi",
      cancelText: "Ở lại",
      onOk: go,
    });
  };

  const currentXml = async () => (await editor.current?.getXml()) ?? detail?.xml ?? "";

  const save = async () => {
    if (!detail) return;
    setBusy("save");
    try {
      const r = await saveProcess({
        id: detail.id,
        key: detail.key,
        name: detail.name,
        description: detail.description,
        xml: await currentXml(),
        forms,
      });
      setIssues(r.issues);
      setDirty(false);
      const errors = r.issues.filter((i) => i.level === "error").length;
      message.success(errors ? `Đã lưu bản nháp (còn ${errors} lỗi).` : "Đã lưu bản nháp.");
      void loadList();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const validate = async () => {
    setBusy("validate");
    try {
      const r = await validateProcess(await currentXml(), forms);
      setIssues(r);
      const errors = r.filter((i) => i.level === "error").length;
      if (errors) message.error(`Kiểm tra: ${errors} lỗi · ${r.length - errors} cảnh báo.`);
      else if (r.length) message.warning(`Kiểm tra: 0 lỗi · ${r.length} cảnh báo.`);
      else message.success("Kiểm tra: không có vấn đề.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const openSandbox = async () => setSandboxTasks(userTasksOf(await currentXml()));

  const sandbox = async ({ decision, variables, taskDecisions }: SandboxInput) => {
    if (!detail) return;
    setBusy("sandbox");
    try {
      if (dirty && canDesign) {
        const saved = await saveProcess({
          id: detail.id,
          key: detail.key,
          name: detail.name,
          description: detail.description,
          xml: await currentXml(),
          forms,
        });
        setIssues(saved.issues);
        setDirty(false);
      }
      const run = await runSandbox(detail.id, {
        ...variables,
        decision,
        ...(Object.keys(taskDecisions).length ? { task_decisions: taskDecisions } : {}),
      });
      setSandboxTasks(undefined);
      setTab("process");
      editor.current?.highlight(run.steps.map((s) => s.activity_id));
      if (run.status === "COMPLETED")
        message.success(`Chạy thử đạt: đi qua ${run.steps.length} bước tới “${run.steps.at(-1)?.name}”.`);
      else message.error(`Chạy thử ${run.status === "FAILED" ? "lỗi" : "dừng"}: ${run.error ?? ""}`);
      await loadDetail(detail.id);
      editor.current?.highlight(run.steps.map((s) => s.activity_id));
      void loadList();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const showRun = (run: SandboxRun) => {
    setTab("process");
    editor.current?.highlight(run.steps.map((s) => s.activity_id));
  };

  const restore = (version: number) => {
    if (!detail) return;
    modal.confirm({
      title: `Khôi phục v${version} về bản nháp?`,
      content: "Nội dung bản nháp hiện tại sẽ bị thay bằng phiên bản này (chưa lưu cho tới khi bạn bấm Lưu bản nháp).",
      okText: "Khôi phục",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          const v = await getProcessVersion(detail.id, version);
          editor.current?.highlight([]);
          setDetail({ ...detail, xml: v.xml });
          setForms(v.forms);
          setDirty(true);
          setTab("process");
          message.success(`Đã nạp v${version} vào bản nháp. Bấm “Lưu bản nháp” để giữ lại.`);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const remove = () => {
    if (!detail) return;
    modal.confirm({
      title: `Xóa quy trình “${detail.name}”?`,
      content: "Chỉ xóa được quy trình chưa từng phát hành. Lịch sử chạy thử cũng bị xóa.",
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await deleteProcess(detail.id);
          message.success("Đã xóa quy trình.");
          setDetail(undefined);
          setParams({});
          await loadList();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const applyMeta = () => {
    if (!detail || !meta) return;
    if (meta.name.trim().length < 2) return message.error("Nhập tên quy trình");
    setDetail({ ...detail, name: meta.name.trim(), description: meta.description.trim() || null });
    setDirty(true);
    setMeta(undefined);
  };

  const openPublish = () => {
    if (!detail) return;
    // Quy trình thuộc một đơn vị: mặc định báo trong đơn vị; quy trình toàn tập đoàn: mặc định báo tất cả
    setPublishing({ audience: detail.audience ?? (detail.ownerUnit ? "UNIT" : "GROUP"), note: "" });
  };

  const publish = async () => {
    if (!detail || !publishing) return;
    setBusy("publish");
    try {
      if (dirty) await save();
      const r = await publishProcess(detail.id, publishing.audience, publishing.note);
      setPublishing(undefined);
      message.success(`Đã phát hành v${r.version} và thông báo cho ${r.notified} người.`);
      await loadDetail(detail.id);
      void loadList();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const toggleAutomation = async (fn: () => Promise<void>, ok: string) => {
    if (!detail) return;
    try {
      await fn();
      message.success(ok);
      await loadDetail(detail.id);
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    }
  };

  const sendChange = async (text: string) => {
    if (!detail) return;
    try {
      await requestChange(detail.id, text);
      setChanging(undefined);
      message.success("Đã gửi yêu cầu sửa chữa tới người thiết kế quy trình.");
      await loadDetail(detail.id);
      setTab("requests");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const resolve = async (id: string, outcome: "RESOLVED" | "DECLINED", note: string) => {
    try {
      await resolveChange(id, outcome, note);
      message.success(outcome === "RESOLVED" ? "Đã đánh dấu đã xử lý." : "Đã từ chối yêu cầu.");
      if (detail) await loadDetail(detail.id);
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2) return message.error("Nhập tên quy trình");
    const key = keyFromName(name);
    try {
      const r = await saveProcess({
        key,
        name,
        xml: newProcessXml(key, name),
        forms: [],
        ownerUnitId: newUnit ?? list?.designUnits[0]?.id,
      });
      setCreating(false);
      setNewName("");
      await loadList();
      setParams({ id: r.id });
      message.success(`Đã tạo quy trình “${name}”.`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const generateRegulation = async (submit: boolean) => {
    if (!detail) return;
    if (dirty) return void message.warning("Lưu bản nháp trước khi lập văn bản quy định.");
    try {
      const r = await draftRegulation(detail.id, submit);
      message.success(
        r.submitted
          ? `Đã lập ${r.docNo} từ v${r.version} và gửi duyệt.`
          : `Đã lập ${r.docNo} từ v${r.version}: vào Thư viện tri thức để gửi duyệt.`,
      );
      if (r.message) message.warning(r.message);
      await loadDetail(detail.id);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const usedBy = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (!detail) return out;
    const doc = new DOMParser().parseFromString(detail.xml, "application/xml");
    doc.querySelectorAll("userTask").forEach((t) => {
      const key = t.getAttribute("flowable:formKey");
      if (key) (out[key] ??= []).push(t.getAttribute("name") || t.getAttribute("id") || "");
    });
    return out;
  }, [detail]);

  if (!list) return <Spin className="mt-24 block" />;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <ProcessHeader
        subtitle={
          detail ? `${detail.name} · mã ${detail.key}${dirty ? " · có thay đổi chưa lưu" : ""}` : "Chưa chọn quy trình"
        }
        access={access}
        dirty={dirty}
        busy={busy}
        onSave={() => void save()}
        onValidate={() => void validate()}
        onSandbox={() => void openSandbox()}
        onEditInfo={() => detail && setMeta({ name: detail.name, description: detail.description ?? "" })}
        onDelete={remove}
        deletable={Boolean(detail) && !detail?.versions.length}
        hasModel={Boolean(detail)}
        onPublish={openPublish}
        onRequestChange={() => setChanging("")}
        onDownload={() => void currentXml().then((x) => downloadText(`${detail?.key ?? "quy-trinh"}.bpmn20.xml`, x))}
      />

      {detail && access !== "view" && (
        <Segmented
          className="self-start"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "process", label: access === "design" ? "Quy trình" : `Sơ đồ v${detail.viewingVersion ?? ""}` },
            ...(canDesign ? [{ value: "forms", label: `Biểu mẫu (${forms.length})` }] : []),
            {
              value: "runs",
              label: canDesign
                ? `Phiên bản & chạy thử (${detail.runs.length})`
                : `Phiên bản & demo (${detail.runs.length})`,
            },
            { value: "auto", label: `Chạy tự động${detail.automation?.status === "ACTIVE" ? " (đang bật)" : ""}` },
            {
              value: "rules",
              label: `Quy định (${detail.regulations.filter((r) => r.kind === "REGULATION").length})`,
            },
            {
              value: "requests",
              label: `Yêu cầu sửa chữa (${detail.changeRequests.filter((c) => c.status === "OPEN").length})`,
            },
          ]}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(200px,20fr)_minmax(0,80fr)]">
        <SidebarTools
          processes={list.models}
          activeId={detail?.id}
          canCreate={list.canDesign}
          onSelect={select}
          onCreate={() => setCreating(true)}
          onFromDocument={() => setFromDoc(true)}
        />
        <div
          className={
            tab !== "process" && access !== "view"
              ? "hidden"
              : access === "view"
                ? "grid grid-cols-1 gap-4"
                : "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
          }
        >
          <div className="min-w-0 self-start overflow-hidden rounded-2xl border border-line shadow-card">
            <Suspense fallback={<Spin className="block py-24" />}>
              {detail && (
                <BpmnEditor
                  ref={editor}
                  xml={detail.xml}
                  readOnly={!canDesign}
                  onSelect={setSelected}
                  onChange={() => setDirty(true)}
                  onError={(m) => message.error(m)}
                />
              )}
            </Suspense>
          </div>
          {access !== "view" && (
            <PropertiesPanel
              showChecks={canDesign}
              element={selected}
              forms={forms}
              issues={issues}
              readOnly={!canDesign}
              onChange={(patch) => selected && editor.current?.update(selected.id, patch)}
              onFocus={(id) => editor.current?.select(id)}
            />
          )}
        </div>
        {tab === "forms" && canDesign && (
          <FormsTab
            forms={forms}
            usedBy={usedBy}
            readOnly={!canDesign}
            onChange={(f) => {
              setForms(f);
              setDirty(true);
            }}
          />
        )}
        {tab === "rules" && detail && access !== "view" && (
          <RegulationTab
            regulations={detail.regulations}
            latestVersion={detail.versions[0]?.version ?? detail.viewingVersion}
            canDraft={canDesign}
            onDraft={generateRegulation}
          />
        )}
        {tab === "auto" && detail && access !== "view" && (
          <AutomationTab
            automation={detail.automation}
            hasPublished={detail.versions.length > 0 || detail.viewingVersion !== null}
            canManage={canDesign}
            onEnable={() =>
              toggleAutomation(() => enableAutomation(detail.id), "Đã bật chạy tự động cho phiên bản mới nhất.")
            }
            onDisable={() => toggleAutomation(() => disableAutomation(detail.id), "Đã tắt chạy tự động.")}
            onEvents={(events) =>
              toggleAutomation(() => setAutomationEvents(detail.id, events), "Đã lưu sự kiện khởi chạy.")
            }
            onWebhook={async () => {
              const path = await createAutomationWebhook(detail.id);
              await loadDetail(detail.id);
              return path;
            }}
            onStart={(variables) =>
              toggleAutomation(() => startAutomation(detail.id, variables), "Đã khởi chạy, hệ thống đang xử lý.")
            }
          />
        )}
        {tab === "requests" && detail && access !== "view" && (
          <ChangeRequestsTab requests={detail.changeRequests} canResolve={canDesign} onResolve={resolve} />
        )}
        {tab === "runs" && detail && access !== "view" && (
          <RunsTab
            runs={detail.runs}
            versions={detail.versions}
            canDesign={canDesign}
            onShowRun={showRun}
            onRestore={restore}
          />
        )}
      </div>

      <SandboxModal
        open={Boolean(sandboxTasks)}
        tasks={sandboxTasks ?? []}
        busy={busy === "sandbox"}
        onRun={(i) => void sandbox(i)}
        onCancel={() => setSandboxTasks(undefined)}
      />

      <Modal
        open={Boolean(meta)}
        title="Thông tin quy trình"
        okText="Áp dụng"
        cancelText="Hủy"
        onOk={applyMeta}
        onCancel={() => setMeta(undefined)}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Tên quy trình"
            value={meta?.name ?? ""}
            onChange={(e) => meta && setMeta({ ...meta, name: e.target.value })}
          />
          <Input.TextArea
            aria-label="Mô tả quy trình"
            autoSize={{ minRows: 3 }}
            placeholder="Mô tả ngắn (không bắt buộc)"
            value={meta?.description ?? ""}
            onChange={(e) => meta && setMeta({ ...meta, description: e.target.value })}
          />
          <p className="m-0 text-[12px] text-muted">
            Mã quy trình <span className="font-mono">{detail?.key}</span> không đổi được sau khi tạo.
          </p>
        </div>
      </Modal>

      <Modal
        open={creating}
        title="Tạo quy trình"
        okText="Tạo"
        cancelText="Hủy"
        onOk={() => void create()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Tên quy trình mới"
            placeholder="Ví dụ: Duyệt hợp đồng"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={() => void create()}
          />
          <label className="block text-[12px] font-medium text-body">
            Đơn vị sở hữu
            <Select
              aria-label="Đơn vị sở hữu quy trình"
              className="mt-1 w-full"
              showSearch
              optionFilterProp="label"
              value={newUnit ?? list.designUnits[0]?.id}
              onChange={setNewUnit}
              options={list.designUnits.map((u) => ({
                value: u.id,
                label: `${"— ".repeat(Math.max(u.path.split(".").length - 1, 0))}${u.name}`,
              }))}
            />
          </label>
          <p className="m-0 text-[12px] text-muted">
            Chỉ chọn được đơn vị mà bạn có quyền thiết kế quy trình (ví dụ phòng do bạn làm trưởng).
          </p>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Mã quy trình: <span className="font-mono">{newName.trim() ? keyFromName(newName) : "—"}</span>
        </p>
      </Modal>

      <FromDocumentModal
        open={fromDoc}
        units={list.designUnits}
        onClose={() => setFromDoc(false)}
        onCreated={(r) => {
          setFromDoc(false);
          setTab("process");
          void loadList().then(() => setParams({ id: r.id }));
          message.success(`Đã dựng bản nháp “${r.name}” (${r.steps} bước). Kiểm tra, chỉnh sửa rồi phát hành.`);
        }}
      />

      <Modal
        open={Boolean(publishing)}
        title="Phát hành phiên bản mới"
        okText="Phát hành và thông báo"
        cancelText="Hủy"
        okButtonProps={{ loading: busy === "publish" }}
        onOk={() => void publish()}
        onCancel={() => setPublishing(undefined)}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] text-body">
            Phiên bản được chụp bất biến. Mọi người trong đối tượng bạn chọn sẽ nhận thông báo và xem được sơ đồ; quản
            lý, giám đốc còn yêu cầu sửa chữa hoặc chạy demo được.
          </p>
          <Radio.Group
            value={publishing?.audience}
            onChange={(e) => publishing && setPublishing({ ...publishing, audience: e.target.value as Audience })}
            className="flex flex-col gap-2"
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                <span className="font-medium">{o.label}</span>
                <span className="ml-2 text-[12px] text-muted">{o.hint}</span>
              </Radio>
            ))}
          </Radio.Group>
          <Input.TextArea
            aria-label="Ghi chú phiên bản"
            placeholder="Ghi chú phiên bản, hiện trong thông báo (không bắt buộc)"
            autoSize={{ minRows: 2 }}
            value={publishing?.note ?? ""}
            onChange={(e) => publishing && setPublishing({ ...publishing, note: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        open={changing !== undefined}
        title="Yêu cầu sửa chữa quy trình"
        okText="Gửi yêu cầu"
        cancelText="Hủy"
        okButtonProps={{ disabled: (changing ?? "").trim().length < 3 }}
        onOk={() => void sendChange((changing ?? "").trim())}
        onCancel={() => setChanging(undefined)}
        destroyOnHidden
      >
        <Input.TextArea
          aria-label="Nội dung yêu cầu sửa chữa"
          autoSize={{ minRows: 4 }}
          maxLength={2000}
          showCount
          placeholder="Nêu bước cần thêm, bớt hoặc sửa và lý do"
          value={changing ?? ""}
          onChange={(e) => setChanging(e.target.value)}
        />
        <p className="mt-2 text-[12px] text-muted">
          Người thiết kế quy trình sẽ nhận thông báo và báo lại cho bạn khi đã xử lý.
        </p>
      </Modal>
    </div>
  );
};

export default ProcessDesignPage;
