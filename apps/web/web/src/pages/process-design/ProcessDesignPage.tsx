// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thiết kế quy trình (Quy trình số, ADR #47): soạn BPMN bằng bpmn-js, biểu mẫu của tác vụ, kiểm tra ở máy chủ,
// chạy thử trên Flowable với khóa sandbox riêng, phát hành phiên bản bất biến. Dữ liệu qua ./api.

// ===== Thư viện =====
import { App, Input, Modal, Segmented, Spin } from "antd"; // Ant Design
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"; // React
import { useSearchParams } from "react-router"; // React Router

// ===== Module nội bộ =====
import { getProcess, listProcesses, publishProcess, runSandbox, saveProcess, validateProcess } from "./api";
import type { BpmnEditorHandle } from "./components/BpmnEditor";
import { FormsTab } from "./components/FormsTab";
import { ProcessHeader } from "./components/ProcessHeader";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { RunsTab } from "./components/RunsTab";
import { SidebarTools } from "./components/SidebarTools";
import { newProcessXml } from "./flowable-moddle";
import type { FormDef, Issue, ProcessDetail, ProcessSummary, SelectedElement } from "./types";
import { downloadText, keyFromName } from "./utils";

// ===== Trang tải lười =====
// bpmn-js nặng: chỉ tải khi mở trang.
const BpmnEditor = lazy(() => import("./components/BpmnEditor"));

// ===== Kiểu dữ liệu =====
type Tab = "process" | "forms" | "runs";

// ===== Component =====
export const ProcessDesignPage = () => {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<{ canDesign: boolean; models: ProcessSummary[] }>();
  const [detail, setDetail] = useState<ProcessDetail>();
  const [forms, setForms] = useState<FormDef[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<SelectedElement>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "validate" | "sandbox" | "publish">();
  const [tab, setTab] = useState<Tab>("process");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const editor = useRef<BpmnEditorHandle>(null);
  const activeId = params.get("id") ?? undefined;
  const canDesign = list?.canDesign ?? false;

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
    if (id && id !== detail?.id) void loadDetail(id);
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

  const sandbox = () => {
    if (!detail) return;
    let decision = "APPROVE";
    modal.confirm({
      title: "Chạy thử trong sandbox?",
      content: (
        <div className="flex flex-col gap-2 text-[13px]">
          <p className="m-0">
            Lưu bản nháp rồi deploy lên Flowable với khóa sandbox riêng, tự hoàn thành từng tác vụ người dùng với quyết
            định dưới đây. Không ảnh hưởng quy trình đang chạy.
          </p>
          <Segmented
            options={[
              { value: "APPROVE", label: "Duyệt" },
              { value: "REJECT", label: "Từ chối" },
              { value: "RETURN", label: "Trả về" },
            ]}
            defaultValue="APPROVE"
            onChange={(v) => (decision = v as string)}
          />
        </div>
      ),
      okText: "Chạy thử",
      cancelText: "Hủy",
      onOk: async () => {
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
          const run = await runSandbox(detail.id, { decision });
          editor.current?.highlight(run.steps.map((s) => s.activity_id));
          if (run.status === "COMPLETED")
            message.success(`Chạy thử đạt: đi qua ${run.steps.length} bước tới “${run.steps.at(-1)?.name}”.`);
          else message.error(`Chạy thử ${run.status === "FAILED" ? "lỗi" : "dừng"}: ${run.error ?? ""}`);
          await loadDetail(detail.id);
          void loadList();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(undefined);
        }
      },
    });
  };

  const publish = () => {
    if (!detail) return;
    let note = "";
    modal.confirm({
      title: "Phát hành phiên bản mới?",
      content: (
        <Input.TextArea placeholder="Ghi chú phiên bản (không bắt buộc)" onChange={(e) => (note = e.target.value)} />
      ),
      okText: "Phát hành",
      cancelText: "Hủy",
      onOk: async () => {
        setBusy("publish");
        try {
          if (dirty) await save();
          const v = await publishProcess(detail.id, note);
          message.success(`Đã phát hành v${v}.`);
          await loadDetail(detail.id);
          void loadList();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(undefined);
        }
      },
    });
  };

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2) return message.error("Nhập tên quy trình");
    const key = keyFromName(name);
    try {
      const r = await saveProcess({ key, name, xml: newProcessXml(key, name), forms: [] });
      setCreating(false);
      setNewName("");
      await loadList();
      setParams({ id: r.id });
      message.success(`Đã tạo quy trình “${name}”.`);
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
        canDesign={canDesign}
        dirty={dirty}
        busy={busy}
        onSave={() => void save()}
        onValidate={() => void validate()}
        onSandbox={sandbox}
        onPublish={publish}
        onDownload={() => void currentXml().then((x) => downloadText(`${detail?.key ?? "quy-trinh"}.bpmn20.xml`, x))}
      />

      <Segmented
        className="self-start"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "process", label: "Quy trình" },
          { value: "forms", label: `Biểu mẫu (${forms.length})` },
          { value: "runs", label: `Phiên bản & chạy thử (${detail?.runs.length ?? 0})` },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(200px,20fr)_minmax(0,80fr)]">
        <SidebarTools
          processes={list.models}
          activeId={detail?.id}
          canDesign={canDesign}
          onSelect={select}
          onCreate={() => setCreating(true)}
        />
        <div className={tab === "process" ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]" : "hidden"}>
          <div className="min-w-0 overflow-hidden rounded-2xl border border-line shadow-card">
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
          <PropertiesPanel
            element={selected}
            forms={forms}
            issues={issues}
            readOnly={!canDesign}
            onChange={(patch) => selected && editor.current?.update(selected.id, patch)}
            onFocus={(id) => editor.current?.select(id)}
          />
        </div>
        {tab === "forms" && (
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
        {tab === "runs" && detail && <RunsTab runs={detail.runs} versions={detail.versions} />}
      </div>

      <Modal
        open={creating}
        title="Tạo quy trình"
        okText="Tạo"
        cancelText="Hủy"
        onOk={() => void create()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Input
          aria-label="Tên quy trình mới"
          placeholder="Ví dụ: Duyệt hợp đồng"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={() => void create()}
        />
        <p className="mt-2 text-[12px] text-muted">
          Mã quy trình: <span className="font-mono">{newName.trim() ? keyFromName(newName) : "—"}</span>
        </p>
      </Modal>
    </div>
  );
};

export default ProcessDesignPage;
