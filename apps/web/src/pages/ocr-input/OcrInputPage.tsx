/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { App, Alert, Drawer, Input, InputNumber, Segmented, Select, Table, Tag, Upload } from "antd";
import { FileSearch, History, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useSession } from "../../auth/useSession";
import { primaryButtonClass, secondaryButtonClass } from "../../components/ui";
import { formatDate, formatDay, formatMoney } from "../../utils/format";
import {
  createDraft,
  downloadUrl,
  getOcrDocument,
  loadOptions,
  recentImports,
  retryOcr,
  saveImport,
  uploadScan,
  type Options,
} from "./api";
import { OcrStepper } from "./components/OcrStepper";
import type { OcrDocument, ParsedItem, RecentImport, Row, Step, StepState } from "./types";
import { tr, trf } from "../../i18n";

const MAX_BYTES = 25 * 1024 * 1024;
const POLL_MS = 2000;
const NEW_PARTNER = "new-partner:";
const FAILED = new Set(["ERROR", "REJECTED", "UNSUPPORTED"]);

type Stage = "idle" | "creating" | "uploading" | "waiting" | "ready" | "failed";

const toRows = (items: ParsedItem[], matches: OcrDocument["item_matches"]): Row[] =>
  items.map((it, n) => {
    const hit = matches?.[n] ?? null;
    return {
      key: n,
      description: it.description,
      uom: it.uom,
      quantity: it.quantity,
      unit_price: it.unit_price,
      item_id: hit?.id ?? null,
      item_code: hit?.code ?? it.item_code,
      note: it.note,
      confidence: it.confidence,
      sourceAmount: it.amount,
    };
  });

const amountOf = (r: Row) => (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);

const confidenceTag = (c: number) =>
  c >= 0.8 ? (
    <Tag color="success">{tr("Tin cậy cao")}</Tag>
  ) : c >= 0.5 ? (
    <Tag color="warning">{tr("Cần xem")}</Tag>
  ) : (
    <Tag color="error">{tr("Nhập tay")}</Tag>
  );

export const OcrInputPage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { tenant } = useSession();
  const [params, setParams] = useSearchParams();
  const [options, setOptions] = useState<Options | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [requestId, setRequestId] = useState<string>();
  const [attachmentId, setAttachmentId] = useState<string>();
  const [doc, setDoc] = useState<OcrDocument>();
  const [failure, setFailure] = useState<string>();
  const [localUrl, setLocalUrl] = useState<{ url: string; image: boolean }>();
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [partner, setPartner] = useState<string | null>(null);
  const [taxCode, setTaxCode] = useState("");
  const [tab, setTab] = useState<"fields" | "text">("fields");
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<RecentImport[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadOptions(tenant.person_id)
      .then(setOptions)
      .catch((e: Error) => message.error(e.message));
  }, [tenant.person_id, message]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl.url);
    },
    [localUrl],
  );

  const fill = useCallback((d: OcrDocument) => {
    const p = d.parsed;
    if (!p) return;
    setRows(toRows(p.items, d.item_matches));
    const supplier = p.supplier_name?.value ?? "";
    const label = d.doc_label ?? tr("Chứng từ");
    setTitle(`${label}${p.doc_no ? ` ${p.doc_no.value}` : ""}${supplier ? ` – ${supplier}` : ""}`.slice(0, 150));
    setTaxCode(p.supplier_tax_code?.value ?? "");
    setPartner(d.partner ? d.partner.id : supplier ? `${NEW_PARTNER}${supplier}` : null);
  }, []);

  const poll = useCallback(
    (id: string) => {
      getOcrDocument(id)
        .then((d) => {
          setDoc(d);
          if (d.phase === "READY") {
            fill(d);
            setStage("ready");
          } else if (FAILED.has(d.phase)) {
            setFailure(
              d.phase === "REJECTED"
                ? tr("Tệp bị loại ở bước quét an toàn.")
                : d.phase === "UNSUPPORTED"
                  ? (d.message ?? tr("Loại tệp này không đọc được chữ."))
                  : (d.ocr?.error ?? tr("OCR không đọc được tệp.")),
            );
            setStage("failed");
          } else {
            timer.current = window.setTimeout(() => poll(id), POLL_MS);
          }
        })
        .catch((e: Error) => {
          setFailure(e.message);
          setStage("failed");
        });
    },
    [fill],
  );

  const openExisting = useCallback(
    (id: string, entityId?: string) => {
      window.clearTimeout(timer.current);
      setAttachmentId(id);
      setRequestId(entityId);
      setLocalUrl(undefined);
      setFailure(undefined);
      setDoc(undefined);
      setStage("waiting");
      poll(id);
    },
    [poll],
  );

  useEffect(() => {
    const a = params.get("attachment");
    if (a && a !== attachmentId) {
      recentImports(tenant.person_id)
        .then((list) => openExisting(a, list.find((r) => r.id === a)?.entity_id))
        .catch(() => openExisting(a));
    }
  }, [params, attachmentId, openExisting, tenant.person_id]);

  const start = async (file: File) => {
    if (file.size > MAX_BYTES) {
      message.error(tr("Tệp tối đa 25 MB"));
      return;
    }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      message.error(tr("Chỉ nhận PDF, PNG hoặc JPEG"));
      return;
    }
    const position =
      options?.core_assignment.find((a) => a.assignment_type === "PRIMARY") ?? options?.core_assignment[0];
    if (!position) {
      message.error(tr("Tài khoản chưa có vị trí công tác nên chưa lập được đề nghị"));
      return;
    }
    window.clearTimeout(timer.current);
    setFailure(undefined);
    setDoc(undefined);
    setLocalUrl({ url: URL.createObjectURL(file), image: file.type.startsWith("image/") });
    try {
      setStage("creating");
      const id = await createDraft(position.position_id, trf("Nhập liệu từ {0}", [file.name]).slice(0, 150));
      setRequestId(id);
      setStage("uploading");
      const up = await uploadScan(id, file);
      setAttachmentId(up.attachmentId);
      if (up.status !== "CLEAN") {
        setFailure(up.scanResult ?? tr("Tệp không qua được bước quét an toàn."));
        setStage("failed");
        return;
      }
      setStage("waiting");
      poll(up.attachmentId);
    } catch (e) {
      setFailure((e as Error).message);
      setStage("failed");
    }
  };

  const reset = () => {
    window.clearTimeout(timer.current);
    setStage("idle");
    setDoc(undefined);
    setAttachmentId(undefined);
    setRequestId(undefined);
    setFailure(undefined);
    setLocalUrl(undefined);
    setRows([]);
    if (params.get("attachment")) setParams({});
  };

  const retry = async () => {
    if (!attachmentId) return;
    try {
      await retryOcr(attachmentId);
      setFailure(undefined);
      setStage("waiting");
      poll(attachmentId);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const openOriginal = async () => {
    if (!attachmentId) return;
    try {
      window.open(await downloadUrl(attachmentId), "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const showRecent = () => {
    setRecentOpen(true);
    recentImports(tenant.person_id)
      .then(setRecent)
      .catch((e: Error) => message.error(e.message));
  };

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const total = rows.reduce((s, r) => s + amountOf(r), 0);
  const docTotal = doc?.parsed?.total_amount ? Number(doc.parsed.total_amount.value) : null;
  const net = doc?.parsed?.net_amount ? Number(doc.parsed.net_amount.value) : null;
  const mismatch = net != null && Math.abs(net - total) > 1;

  const save = async () => {
    if (!requestId) return;
    const bad = rows.findIndex(
      (r) => !r.description.trim() || !r.uom.trim() || !(Number(r.quantity) > 0) || Number(r.unit_price) < 0,
    );
    if (rows.length === 0 || bad >= 0) {
      message.error(
        rows.length === 0
          ? tr("Cần ít nhất một dòng hàng")
          : trf("Dòng {0}: cần mô tả, đơn vị tính và số lượng lớn hơn 0", [bad + 1]),
      );
      return;
    }
    if (!title.trim()) {
      message.error(tr("Nhập tiêu đề đề nghị"));
      return;
    }
    const isNew = partner?.startsWith(NEW_PARTNER) ?? false;
    const p = doc?.parsed;
    const description = [
      trf("Nhập từ {0} {1}", [doc?.doc_label ?? tr("chứng từ"), p?.doc_no ? p.doc_no.value : ""]).trim(),
      p?.date ? trf("ngày {0}", [formatDay(p.date.value)]) : null,
      trf("(tệp {0})", [doc?.file_name]),
    ]
      .filter(Boolean)
      .join(" ");
    setSaving(true);
    try {
      await saveImport(
        requestId,
        {
          title: title.trim(),
          description,
          category_code: doc?.item_matches?.find((m) => m?.category_code)?.category_code ?? null,
          partner_id: isNew ? null : partner,
          proposed_partner_name: isNew ? (partner as string).slice(NEW_PARTNER.length) : null,
          proposed_partner_tax_code: isNew ? taxCode.trim() || null : null,
        },
        rows.map((r, n) => ({
          line_no: n + 1,
          item_id: r.item_id,
          description: r.description.trim(),
          uom: r.uom.trim(),
          quantity: r.quantity,
          unit_price: r.unit_price,
          note: r.note,
        })),
      );
      message.success(tr("Đã điền vào đề nghị mua sắm nháp. Kiểm tra lần cuối rồi gửi duyệt."));
      navigate(`/p/documents/show/${requestId}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const phase = doc?.phase;
  const state = (n: number): StepState => {
    const at =
      stage === "idle"
        ? 0
        : stage === "creating" || stage === "uploading"
          ? 1
          : phase === "SCANNING"
            ? 2
            : phase === "QUEUED" || phase === "OCR"
              ? 3
              : stage === "ready"
                ? 5
                : 3;
    if (stage === "idle") return n === 1 ? "active" : "pending";
    if (n < at) return "done";
    if (n === at) return stage === "ready" ? "done" : "running";
    return "pending";
  };
  const steps: Step[] = [
    {
      key: "up",
      title: tr("Tải lên"),
      sub: stage === "idle" ? tr("Chọn bản quét hoặc ảnh chụp") : (doc?.file_name ?? tr("Đang tải tệp lên")),
      state: state(1),
    },
    { key: "scan", title: tr("Quét an toàn"), sub: tr("Tệp chưa sạch thì không đọc"), state: state(2) },
    {
      key: "ocr",
      title: tr("Đọc chữ (OCR)"),
      sub: doc?.ocr?.pages_total ? `Trang ${doc.ocr.pages_done}/${doc.ocr.pages_total}` : tr("Nhận dạng tiếng Việt"),
      state: state(3),
    },
    {
      key: "review",
      title: tr("Kiểm tra và lưu"),
      sub: tr("Xem lại từng trường"),
      state: stage === "ready" ? "active" : "pending",
    },
  ];

  const parsed = doc?.parsed;
  const busy = stage === "creating" || stage === "uploading" || stage === "waiting";

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {tr("Nhập liệu OCR")}
          </h1>
          <p className="m-0 mt-1 max-w-[640px] text-[13px] text-muted">
            {tr(
              "Tải bản quét hoặc ảnh chụp báo giá, hóa đơn. Hệ thống đọc chữ, rút nhà cung cấp, dòng hàng, số tiền và điền vào một đề nghị mua sắm nháp để bạn kiểm tra rồi gửi duyệt.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryButtonClass} onClick={showRecent}>
            <History className="mr-1.5 h-4 w-4" aria-hidden /> {tr(" Lần nhập gần đây")}
          </button>
          {stage !== "idle" && (
            <button type="button" className={secondaryButtonClass} onClick={reset}>
              {tr("Nhập tệp khác")}
            </button>
          )}
        </div>
      </header>

      <OcrStepper steps={steps} />

      {stage === "idle" && (
        <Upload.Dragger
          accept=".pdf,.png,.jpg,.jpeg"
          showUploadList={false}
          multiple={false}
          disabled={!options}
          beforeUpload={(f) => {
            void start(f);
            return false;
          }}
          aria-label={tr("Thả tệp cần nhập liệu")}
        >
          <p className="m-0 text-[15px] font-semibold text-ink">{tr("Thả tệp vào đây hoặc bấm để chọn")}</p>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            {tr("PDF quét, PNG, JPEG · tối đa 25 MB · mỗi tệp tạo một đề nghị mua sắm nháp")}
          </p>
        </Upload.Dragger>
      )}

      {busy && (
        <div
          role="status"
          className="rounded-2xl border border-line bg-surface p-5 text-[13.5px] text-body shadow-card"
        >
          {stage === "creating" && tr("Đang tạo đề nghị nháp…")}
          {stage === "uploading" && tr("Đang tải lên và quét an toàn…")}
          {stage === "waiting" &&
            (phase === "SCANNING"
              ? tr("Đang quét an toàn…")
              : phase === "OCR"
                ? trf("Đang đọc chữ{0}", [
                    doc?.ocr?.pages_total ? `: trang ${doc.ocr.pages_done}/${doc.ocr.pages_total}` : "…",
                  ])
                : tr("Đang chờ tới lượt đọc chữ (OCR dùng chung mô hình với trợ lý AI)…"))}
        </div>
      )}

      {stage === "failed" && (
        <Alert
          type="error"
          showIcon
          message={tr("Chưa nhập liệu được")}
          description={failure}
          action={
            attachmentId && phase === "ERROR" ? (
              <button type="button" className={secondaryButtonClass} onClick={() => void retry()}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden /> {tr(" Thử lại OCR")}
              </button>
            ) : undefined
          }
        />
      )}

      {stage === "ready" && parsed && doc && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-label={tr("Bản gốc")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-[14px] font-semibold text-ink">{tr("Bản gốc")}</h2>
              <button
                type="button"
                className="text-[12.5px] text-bamboo-700 underline"
                onClick={() => void openOriginal()}
              >
                {tr("Mở tệp gốc")}
              </button>
            </div>
            <div className="mt-3 overflow-auto rounded-xl bg-canvas p-3" style={{ maxHeight: 560 }}>
              {localUrl?.image ? (
                <img
                  src={localUrl.url}
                  alt={trf("Bản quét {0}", [doc.file_name])}
                  className="mx-auto block max-w-full rounded-md bg-surface shadow-card"
                />
              ) : localUrl ? (
                <iframe
                  title={trf("Bản quét {0}", [doc.file_name])}
                  src={localUrl.url}
                  className="h-[520px] w-full rounded-md bg-surface"
                />
              ) : (
                <p className="m-0 p-6 text-center text-[12.5px] text-muted">
                  {tr("Bấm “Mở tệp gốc” để xem bản đã tải lên.")}
                </p>
              )}
            </div>
          </section>

          <section
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card"
            aria-label={tr("Trường đã rút")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[14px] font-semibold text-ink">
                {doc.doc_label} {parsed.doc_no ? <span className="font-mono">{parsed.doc_no.value}</span> : null}
                {parsed.date ? (
                  <span className="ml-2 text-[12.5px] font-normal text-muted">
                    {tr("ngày ")} {formatDay(parsed.date.value)}
                  </span>
                ) : null}
              </h2>
              <Segmented
                value={tab}
                onChange={(v) => setTab(v as "fields" | "text")}
                options={[
                  { value: "fields", label: tr("Trường đã rút") },
                  { value: "text", label: tr("Chữ OCR") },
                ]}
              />
            </div>

            {parsed.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={tr("Cần kiểm tra lại")}
                description={
                  <ul className="m-0 list-disc pl-4">
                    {parsed.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {tab === "text" ? (
              <pre
                className="m-0 max-h-[460px] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 font-mono text-[12px] text-body"
                aria-label={tr("Chữ OCR")}
              >
                {doc.text}
              </pre>
            ) : (
              <>
                <label className="block text-[12.5px] font-medium text-body">
                  {tr("Tiêu đề đề nghị")}
                  <Input
                    aria-label={tr("Tiêu đề đề nghị")}
                    className="mt-1"
                    value={title}
                    maxLength={150}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <div>
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-body">
                    {tr("Nhà cung cấp")}
                    {parsed.supplier_name && confidenceTag(parsed.supplier_name.confidence)}
                    {doc.partner && (
                      <Tag color="green">
                        {tr("Khớp danh mục theo ")} {doc.partner.by === "tax_code" ? tr("mã số thuế") : tr("tên")}
                      </Tag>
                    )}
                  </div>
                  <Select
                    aria-label={tr("Nhà cung cấp")}
                    className="mt-1 w-full"
                    showSearch
                    optionFilterProp="label"
                    value={partner ?? undefined}
                    onChange={(v: string) => setPartner(v)}
                    options={[
                      ...(partner?.startsWith(NEW_PARTNER)
                        ? [
                            {
                              value: partner,
                              label: trf("＋ Dùng nhà cung cấp mới “{0}”", [partner.slice(NEW_PARTNER.length)]),
                            },
                          ]
                        : []),
                      ...(options?.mdm_partner ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
                    ]}
                  />
                  {partner?.startsWith(NEW_PARTNER) && (
                    <label className="mt-2 block text-[12.5px] font-medium text-body">
                      {tr("Mã số thuế nhà cung cấp mới")}
                      <Input
                        aria-label={tr("Mã số thuế nhà cung cấp mới")}
                        className="mt-1 font-mono"
                        value={taxCode}
                        onChange={(e) => setTaxCode(e.target.value)}
                      />
                    </label>
                  )}
                  {parsed.supplier_address && (
                    <p className="m-0 mt-1 text-[11.5px] text-muted">
                      {tr("Địa chỉ đọc được: ")} {parsed.supplier_address.value}
                    </p>
                  )}
                </div>

                <Table<Row>
                  size="small"
                  rowKey="key"
                  dataSource={rows}
                  pagination={false}
                  aria-label={tr("Dòng hàng")}
                  locale={{ emptyText: tr("Không nhận ra dòng hàng nào") }}
                  scroll={{ x: 640 }}
                  columns={[
                    { title: "TT", width: 36, render: (_: unknown, __: Row, i: number) => i + 1 },
                    {
                      title: tr("Tên hàng hóa, dịch vụ"),
                      render: (_: unknown, r: Row) => (
                        <div>
                          <Input
                            aria-label={trf("Mô tả dòng {0}", [r.key + 1])}
                            value={r.description}
                            onChange={(e) => setRow(r.key, { description: e.target.value })}
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                            {confidenceTag(r.confidence)}
                            {r.item_id ? (
                              <Tag color="green">
                                {tr("Khớp mã ")} {r.item_code}
                              </Tag>
                            ) : r.item_code ? (
                              <span>
                                {tr("Mã đọc được: ")} {r.item_code}
                              </span>
                            ) : null}
                            {Math.abs(Number(r.sourceAmount) - amountOf(r)) > 1 && (
                              <span className="text-red-700">
                                {tr("Bản gốc ghi ")} {formatMoney(r.sourceAmount)}
                              </span>
                            )}
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: tr("ĐVT"),
                      width: 78,
                      render: (_: unknown, r: Row) => (
                        <Input
                          aria-label={trf("ĐVT dòng {0}", [r.key + 1])}
                          value={r.uom}
                          onChange={(e) => setRow(r.key, { uom: e.target.value })}
                        />
                      ),
                    },
                    {
                      title: tr("Số lượng"),
                      width: 100,
                      render: (_: unknown, r: Row) => (
                        <InputNumber
                          aria-label={trf("Số lượng dòng {0}", [r.key + 1])}
                          min={0}
                          value={Number(r.quantity)}
                          onChange={(v) => setRow(r.key, { quantity: String(v ?? 0) })}
                        />
                      ),
                    },
                    {
                      title: tr("Đơn giá"),
                      width: 120,
                      render: (_: unknown, r: Row) => (
                        <InputNumber
                          aria-label={trf("Đơn giá dòng {0}", [r.key + 1])}
                          min={0}
                          value={Number(r.unit_price)}
                          onChange={(v) => setRow(r.key, { unit_price: String(v ?? 0) })}
                        />
                      ),
                    },
                    {
                      title: tr("Thành tiền"),
                      width: 120,
                      align: "right",
                      render: (_: unknown, r: Row) => formatMoney(amountOf(r)),
                    },
                  ]}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span>
                    {tr("Tổng các dòng: ")} <strong>{formatMoney(total)}</strong>
                    {docTotal != null && (
                      <span className="ml-3 text-muted">
                        {tr("Tổng cộng trên chứng từ (gồm thuế")}
                        {parsed.vat ? ` ${parsed.vat.rate}%` : ""}): {formatMoney(docTotal)}
                      </span>
                    )}
                  </span>
                  {mismatch && <Tag color="error">{tr("Tổng các dòng khác cộng tiền hàng trên chứng từ")}</Tag>}
                </div>
                <p className="m-0 text-[11.5px] text-muted">
                  {tr("Đề nghị mua sắm tính tiền hàng chưa gồm thuế; thuế GTGT trên chứng từ không đưa vào dòng hàng.")}
                </p>
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              <button type="button" className={secondaryButtonClass} onClick={() => void retry()}>
                <FileSearch className="mr-1.5 h-4 w-4" aria-hidden /> {tr(" Đọc lại")}
              </button>
              <button type="button" className={primaryButtonClass} disabled={saving} onClick={() => void save()}>
                {tr("Điền vào đề nghị và mở")}
              </button>
            </div>
          </section>
        </div>
      )}

      <Drawer open={recentOpen} onClose={() => setRecentOpen(false)} title={tr("Lần nhập gần đây")} width={420}>
        {recent.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">{tr("Chưa có tệp nào đã được đọc chữ.")}</p>
        ) : (
          <ul className="m-0 list-none flex flex-col gap-2 p-0">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-line bg-surface p-3 text-left hover:bg-bamboo-50"
                  onClick={() => {
                    setRecentOpen(false);
                    setParams({ attachment: r.id });
                    openExisting(r.id, r.entity_id);
                  }}
                >
                  <span className="block text-[13.5px] font-semibold text-ink">{r.file_name}</span>
                  <span className="block text-[11.5px] text-muted">
                    {formatDate(r.created_at)} · {r.ocr?.status === "DONE" ? tr("Đã OCR") : tr("Đã có chữ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
};
