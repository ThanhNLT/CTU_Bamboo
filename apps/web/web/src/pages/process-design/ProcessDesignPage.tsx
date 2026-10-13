// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thiết kế quy trình (Quy trình số): soạn bản nháp BPMN trực quan. 3 cột ~20/55/25: danh sách quy trình +
// bảng thành phần · canvas · thuộc tính. Xuất tệp BPMN để commit vào Git (CI triển khai). Dữ liệu minh họa ở ./mock.

// ===== Thư viện =====
import { App, Segmented } from "antd"; // Ant Design
import { useMemo, useRef, useState } from "react"; // React

// ===== Module nội bộ =====
import { BpmnCanvasMock } from "./components/BpmnCanvasMock";
import { FormsTab } from "./components/FormsTab";
import { ProcessHeader } from "./components/ProcessHeader";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SidebarTools } from "./components/SidebarTools";
import { MOCK_PROCESSES } from "./mock";
import type { BpmnEdge, BpmnNode, NodeType, ProcessModel } from "./types";
import { useHistory } from "./useHistory";
import { downloadText, newNode, toBpmnXml, validate } from "./utils";

// ===== Kiểu dữ liệu =====
type Tab = "process" | "forms";

// ===== Component =====
export const ProcessDesignPage = () => {
  const { message, modal } = App.useApp();
  const [processId, setProcessId] = useState(MOCK_PROCESSES[0].id);
  const [tab, setTab] = useState<Tab>("process");
  const [zoom, setZoom] = useState(100);
  const [selectedId, setSelectedId] = useState<string | undefined>("l1");
  // Bản nháp của từng quy trình, giữ lại khi chuyển qua lại giữa các quy trình.
  const drafts = useRef(new Map<string, ProcessModel>());
  const history = useHistory<ProcessModel>(MOCK_PROCESSES[0].model);

  const process = MOCK_PROCESSES.find((p) => p.id === processId) ?? MOCK_PROCESSES[0];
  const model = history.value;
  const issues = useMemo(() => validate(model), [model]);
  const selected = model.nodes.find((n) => n.id === selectedId);

  const switchProcess = (id: string) => {
    if (id === processId) return;
    drafts.current.set(processId, model);
    const next = MOCK_PROCESSES.find((p) => p.id === id);
    if (!next) return;
    history.reset(drafts.current.get(id) ?? next.model);
    setProcessId(id);
    setSelectedId(undefined);
  };

  const patchNode = (patch: Partial<BpmnNode>, key: string) => {
    if (!selectedId) return;
    history.set((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)) }), key);
  };

  const patchEdge = (edgeId: string, patch: Partial<BpmnEdge>) =>
    history.set((m) => ({ ...m, edges: m.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)) }));

  const addNode = (type: NodeType, x: number, y: number) => {
    const node = newNode(type, x, y);
    history.set((m) => ({ ...m, nodes: [...m.nodes, node] }));
    setSelectedId(node.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    history.set((m) => ({
      nodes: m.nodes.filter((n) => n.id !== selectedId),
      edges: m.edges.filter((e) => e.from !== selectedId && e.to !== selectedId),
    }));
    setSelectedId(undefined);
  };

  const summary = () => {
    const errors = issues.filter((i) => i.level === "error").length;
    return { errors, warnings: issues.length - errors };
  };

  const runValidate = () => {
    const { errors, warnings } = summary();
    if (errors) message.error(`Kiểm tra: ${errors} lỗi · ${warnings} cảnh báo.`);
    else if (warnings) message.warning(`Kiểm tra: 0 lỗi · ${warnings} cảnh báo.`);
    else message.success("Kiểm tra: không có vấn đề.");
  };

  const runSandbox = () => {
    const { errors } = summary();
    if (errors) {
      message.error(`Còn ${errors} lỗi — sửa trước khi chạy thử.`);
      return;
    }
    modal.confirm({
      title: "Chạy thử trong sandbox?",
      content: "Tạo một hồ sơ giả và chạy qua quy trình bản nháp. Không ảnh hưởng dữ liệu thật.",
      okText: "Chạy thử",
      cancelText: "Hủy",
      onOk: () => message.success(`Đã khởi tạo phiên chạy thử “${process.name}” v${process.version}.`),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <ProcessHeader
        process={process}
        onValidate={runValidate}
        onDownload={() => downloadText(`${process.key}.bpmn20.xml`, toBpmnXml(process, model))}
        onSandbox={runSandbox}
      />

      <Segmented
        className="self-start"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "process", label: "Quy trình" },
          { value: "forms", label: "Biểu mẫu" },
        ]}
      />

      {tab === "forms" ? (
        <FormsTab model={model} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(200px,20fr)_minmax(0,55fr)] xl:grid-cols-[minmax(200px,20fr)_minmax(0,55fr)_minmax(260px,25fr)]">
          <SidebarTools processes={MOCK_PROCESSES} activeId={processId} onSelect={switchProcess} />
          <BpmnCanvasMock
            title={`${process.name} · v${process.version}`}
            model={model}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDropNode={addNode}
            zoom={zoom}
            onZoomChange={setZoom}
            onUndo={history.undo}
            onRedo={history.redo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
          />
          <div className="lg:col-span-2 xl:col-span-1">
            <PropertiesPanel
              node={selected}
              model={model}
              issues={issues}
              onChange={patchNode}
              onEdgeChange={patchEdge}
              onDelete={deleteSelected}
              onFocusNode={setSelectedId}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessDesignPage;
