// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nhập liệu OCR (Trí tuệ số): tải ảnh giấy tờ → quét mã độc (ClamAV) → trích xuất trường (Tesseract + PaddleOCR)
// → người dùng kiểm tra → tạo hồ sơ nháp. Bản demo mô phỏng các bước phía máy chủ bằng hẹn giờ và dữ liệu ./mock.
import { App } from "antd";
import { Camera, History } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "../../components/ui";
import { cn } from "../../utils/cn";
import { DocumentViewer } from "./components/DocumentViewer";
import { ExtractedFieldsForm } from "./components/ExtractedFieldsForm";
import { ImportHistoryDrawer } from "./components/ImportHistoryDrawer";
import { OcrStepper } from "./components/OcrStepper";
import { IMPORT_COUNT, IMPORT_HISTORY, NEXT_RECORD_CODE, OCR_FIELDS, RECORD_TYPES, SAMPLE_DOC, TEMPLATE } from "./mock";
import type { FieldKey, FormValues, ImportRecord, Phase, SourceDoc, Step } from "./types";
import { formatBytes, initialValues, pendingReview, validate } from "./utils";

/** Thời gian mô phỏng từng bước phía máy chủ (ms). */
const DURATION: Record<Exclude<Phase, "review" | "created">, number> = {
  uploading: 500,
  scanning: 900,
  extracting: 1200,
};
const BUSY_LABEL: Record<Phase, string | undefined> = {
  uploading: "Đang tải lên…",
  scanning: "Đang quét mã độc…",
  extracting: "Đang trích xuất trường…",
  review: undefined,
  created: undefined,
};
const MAX_BYTES = 20 * 1024 * 1024;

export const OcrInputPage = () => {
  const { message, modal } = App.useApp();
  const [doc, setDoc] = useState<SourceDoc>(SAMPLE_DOC);
  const [phase, setPhase] = useState<Phase>("review");
  const [values, setValues] = useState<FormValues>(() => initialValues(OCR_FIELDS, RECORD_TYPES[0] ?? ""));
  const [reviewed, setReviewed] = useState<Set<FieldKey>>(() => new Set());
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [activeKey, setActiveKey] = useState<FieldKey>();
  const [createdCode, setCreatedCode] = useState<string>();
  const [history, setHistory] = useState<ImportRecord[]>(IMPORT_HISTORY);
  const [historyOpen, setHistoryOpen] = useState(false);
  const timers = useRef(new Set<number>());
  // Ảnh xem trước tạo bằng URL.createObjectURL → thu hồi khi đổi ảnh / rời trang.
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const set = timers.current;
    const urls = objectUrls.current;
    return () => {
      set.forEach((t) => window.clearTimeout(t));
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const revokeUrls = () => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current.clear();
  };

  const pending = pendingReview(OCR_FIELDS, reviewed);
  const busy = BUSY_LABEL[phase];

  /** Chạy lại chuỗi bước máy chủ từ `from`, xong thì về trạng thái kiểm tra với kết quả OCR mới. */
  const runPipeline = (from: "uploading" | "extracting") => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.clear();
    const order: Phase[] =
      from === "uploading" ? ["uploading", "scanning", "extracting", "review"] : ["extracting", "review"];
    let at = 0;
    setPhase(order[0] ?? "review");
    setCreatedCode(undefined);
    setErrors({});
    setActiveKey(undefined);
    setValues(initialValues(OCR_FIELDS, RECORD_TYPES[0] ?? ""));
    setReviewed(new Set());
    order.slice(1).forEach((next, i) => {
      const prev = order[i] as keyof typeof DURATION;
      at += DURATION[prev];
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setPhase(next);
      }, at);
      timers.current.add(t);
    });
  };

  const onUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      message.error("Chỉ nhận ảnh chụp hoặc ảnh quét (JPG, PNG, HEIC…).");
      return;
    }
    if (file.size > MAX_BYTES) {
      message.error("Ảnh lớn hơn 20 MB. Chụp lại ở độ phân giải thấp hơn.");
      return;
    }
    revokeUrls();
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    setDoc({ kind: "upload", name: file.name, sizeLabel: formatBytes(file.size), pages: 1, url });
    runPipeline("uploading");
  };

  const change = (key: FieldKey | "recordType", v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    if (key !== "recordType") {
      // Sửa một trường = đã kiểm tra trường đó.
      setReviewed((s) => new Set(s).add(key));
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  };

  const create = () => {
    const e = validate(values);
    setErrors(e);
    const firstError = Object.keys(e)[0] as FieldKey | undefined;
    if (firstError) {
      document.getElementById(`ocr-field-${firstError}`)?.focus();
      return;
    }
    const finish = () => {
      setCreatedCode(NEXT_RECORD_CODE);
      setPhase("created");
      setHistory((h) => [
        {
          id: `ih-${Date.now()}`,
          file: doc.name,
          template: TEMPLATE.name,
          at: "Vừa xong",
          result: NEXT_RECORD_CODE,
          to: "/p/records",
        },
        ...h,
      ]);
      message.success(`Đã tạo hồ sơ nháp ${NEXT_RECORD_CODE} · ${values.recordType}.`);
    };
    const left = pendingReview(OCR_FIELDS, reviewed);
    if (left.length) {
      modal.confirm({
        title: `Còn ${left.length} trường chưa kiểm tra`,
        content: `${left.map((f) => f.label).join(", ")} có độ tin cậy thấp. Vẫn tạo hồ sơ nháp?`,
        okText: "Vẫn tạo nháp",
        cancelText: "Xem lại",
        onOk: finish,
      });
    } else finish();
  };

  const reset = () => {
    revokeUrls();
    setDoc(SAMPLE_DOC);
    runPipeline("uploading");
  };

  const steps: Step[] = useMemo(() => {
    const at = (["uploading", "scanning", "extracting", "review", "created"] as Phase[]).indexOf(phase);
    const runOrDone = (i: number): Step["state"] => (at > i ? "done" : at === i ? "running" : "pending");
    const reviewState: Step["state"] = at === 2 ? "running" : at === 3 ? "active" : at === 4 ? "done" : "pending";
    const reviewSub =
      at < 2
        ? "Chờ quét xong"
        : at === 2
          ? "Đang trích xuất…"
          : `${OCR_FIELDS.length} trường · ${pending.length ? `${pending.length} cần xem` : "đã kiểm tra hết"}`;
    return [
      { key: "upload", title: "Tải lên", sub: at === 0 ? "Đang tải…" : doc.name, state: runOrDone(0) },
      {
        key: "scan",
        title: "Quét mã độc",
        sub: at === 0 ? "Chờ tải xong" : at === 1 ? "Đang quét…" : "Sạch · ClamAV",
        state: runOrDone(1),
      },
      { key: "review", title: "Kiểm tra trường", sub: reviewSub, state: reviewState },
      {
        key: "create",
        title: "Tạo hồ sơ",
        sub: createdCode ?? "Chờ bạn xác nhận",
        state: at === 4 ? "done" : "pending",
      },
    ];
  }, [phase, doc.name, pending.length, createdCode]);

  const templateNote =
    doc.kind === "sample"
      ? `Mẫu nhận diện: ${TEMPLATE.name} · khớp ${Math.round(TEMPLATE.match * 100)}% · OCR ${TEMPLATE.engines}`
      : `Bản demo: ảnh của bạn được hiển thị, còn các trường bên phải là kết quả mẫu của ${TEMPLATE.name}. OCR thật chạy trên máy chủ (${TEMPLATE.engines}).`;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Nhập liệu OCR</h1>
          <p className="mt-1 text-[13px] text-muted">
            Chụp hoặc quét giấy tờ → hệ thống trích xuất trường → bạn kiểm tra → tạo hồ sơ
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => setHistoryOpen(true)} className={secondaryButtonClass}>
            <History className="h-4 w-4" aria-hidden />
            Lịch sử nhập ({IMPORT_COUNT + history.length - IMPORT_HISTORY.length})
          </button>
          {/* capture="environment": trên điện thoại mở thẳng camera sau. */}
          <label
            className={cn(
              primaryButtonClass,
              "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-bamboo-500",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy != null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
            <Camera className="h-4 w-4" aria-hidden />
            Tải ảnh mới
          </label>
        </div>
      </div>

      <OcrStepper steps={steps} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <DocumentViewer
          doc={doc}
          fields={OCR_FIELDS}
          busy={busy}
          activeKey={activeKey}
          onPick={(k) => {
            setActiveKey(k);
            document.getElementById(`ocr-field-${k}`)?.focus();
          }}
          templateNote={templateNote}
        />
        <ExtractedFieldsForm
          fields={OCR_FIELDS}
          values={values}
          reviewed={reviewed}
          errors={errors}
          pendingCount={pending.length}
          disabled={busy != null}
          createdCode={createdCode}
          onChange={change}
          onConfirm={(k) => setReviewed((s) => new Set(s).add(k))}
          onFocusField={setActiveKey}
          onCreate={create}
          onRescan={() => runPipeline("extracting")}
          onReset={reset}
        />
      </div>

      <ImportHistoryDrawer
        open={historyOpen}
        total={IMPORT_COUNT + history.length - IMPORT_HISTORY.length}
        items={history}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
};

export default OcrInputPage;
