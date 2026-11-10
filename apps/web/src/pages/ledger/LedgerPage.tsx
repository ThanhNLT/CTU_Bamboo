/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { App } from "antd";
import { Download, Link2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { request } from "../../api/client";
import { secondaryButtonClass } from "../../components/ui";
import { copyText } from "../../utils/clipboard";
import { fetchArchive, fetchOverview, openArchive, verify } from "./api";
import { LedgerStats, type LedgerStat } from "./components/LedgerStats";
import { LedgerTabs } from "./components/LedgerTabs";
import { ReadingRoomPanel } from "./components/ReadingRoomPanel";
import { ReadOnlyViewerModal } from "./components/ReadOnlyViewerModal";
import { RecentSealsWidget } from "./components/RecentSealsWidget";
import { VerificationPanel } from "./components/VerificationPanel";
import { VirtualReadingRoomWidget } from "./components/VirtualReadingRoomWidget";
import type { AccessLog, ArchiveDoc, ArchiveView, LedgerOverview, LedgerTab, VerifyResult } from "./types";
import {
  MAX_FILE_BYTES,
  certificateHtml,
  downloadText,
  evidenceText,
  formatInt,
  formatStamp,
  reconciliationCsv,
  sha256Hex,
} from "./utils";
import { tr, trf } from "../../i18n";

const FEATURED = 3;

export const LedgerPage = () => {
  const { message } = App.useApp();
  const [params] = useSearchParams();

  const [tab, setTab] = useState<LedgerTab>("verify");
  const [code, setCode] = useState(() => params.get("doc") ?? "");
  const [result, setResult] = useState<VerifyResult>();
  const [busy, setBusy] = useState(false);
  const [hashing, setHashing] = useState<{ name: string; size: number }>();
  const [overview, setOverview] = useState<LedgerOverview>();
  const [archive, setArchive] = useState<{ docs: ArchiveDoc[]; access: AccessLog[] }>({ docs: [], access: [] });
  const [viewing, setViewing] = useState<ArchiveView>();
  const runId = useRef(0);

  const loadOverview = useCallback(
    () =>
      fetchOverview()
        .then(setOverview)
        .catch((e: Error) => message.error(trf("Không tải được số liệu sổ cái: {0}", [e.message]))),
    [message],
  );
  const loadArchive = useCallback(
    () =>
      fetchArchive()
        .then(setArchive)
        .catch((e: Error) => message.error(trf("Không tải được hồ sơ lưu trữ: {0}", [e.message]))),
    [message],
  );

  const run = useCallback(
    async (input: Parameters<typeof verify>[0]) => {
      const id = ++runId.current;
      try {
        const r = await verify(input);
        if (id !== runId.current) return;
        setResult(r);
        void loadOverview();
      } catch (e) {
        if (id === runId.current) message.error((e as Error).message);
      }
    },
    [loadOverview, message],
  );

  const verifyCode = useCallback(
    async (input: string) => {
      setBusy(true);
      try {
        await run({ code: input.trim() });
      } finally {
        setBusy(false);
      }
    },
    [run],
  );

  useEffect(() => {
    void loadOverview();
    void loadArchive();
    const initial = params.get("doc");
    if (initial) void verifyCode(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      message.error(tr("Tệp lớn hơn 200 MB — hãy đối soát theo số chứng từ."));
      return;
    }
    setHashing({ name: file.name, size: file.size });
    let hash: string;
    try {
      hash = await sha256Hex(file);
    } catch {
      message.error(tr("Không đọc được tệp. Thử lại hoặc chọn tệp khác."));
      setHashing(undefined);
      return;
    }
    try {
      await run({ sha256: hash, fileName: file.name });
    } finally {
      setHashing(undefined);
    }
  };

  const copyEvidence = async () => {
    if (!result) return;
    const ok = await copyText(evidenceText(result));
    if (ok) message.success(tr("Đã sao chép bằng chứng đối soát."));
    else message.error(tr("Không sao chép được. Trình duyệt chặn bộ nhớ tạm."));
  };

  const openCertificate = () => {
    if (!result || result.kind === "not_found") return;
    const w = window.open("", "_blank");
    if (!w) {
      message.error(tr("Trình duyệt chặn cửa sổ mới. Cho phép cửa sổ bật lên rồi thử lại."));
      return;
    }
    w.document.open();
    w.document.write(certificateHtml(result));
    w.document.close();
    message.info(tr("Trong hộp thoại In, chọn “Lưu dưới dạng PDF”."));
  };

  const exportReport = async () => {
    try {
      const all = await fetchOverview(100);
      const day = formatStamp(new Date()).slice(0, 10).split("/").reverse().join("-");
      downloadText(reconciliationCsv(all.recent), `doi-soat-so-cai-${day}.csv`, "text/csv;charset=utf-8");
      message.success(trf("Đã xuất báo cáo đối soát ({0} bản niêm phong mới nhất).", [all.recent.length]));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const verifyChain = async () => {
    try {
      const r = await request<{ verify_audit_chain: { ok: boolean; checked: number; problems: unknown[] } }>(
        `query { verify_audit_chain { ok checked problems { seq problem } } }`,
      );
      const v = r.verify_audit_chain;
      if (v.ok) message.success(trf("Chuỗi hash kiểm toán nguyên vẹn ({0} dòng).", [formatInt(v.checked)]));
      else message.error(trf("Chuỗi hash có {0} chỗ không khớp — xem trang Kiểm toán.", [v.problems.length]));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const openDoc = async (doc: ArchiveDoc) => {
    try {
      setViewing(await openArchive(doc.id));
      void loadArchive();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const o = overview;
  const stats: LedgerStat[] = [
    {
      key: "sealed",
      label: tr("Đã niêm phong"),
      value: o?.sealed ?? 0,
      note: trf("+{0} trong 7 ngày", [formatInt(o?.sealedThisWeek ?? 0)]),
    },
    {
      key: "today",
      label: tr("Đối soát hôm nay"),
      value: o?.checkedToday ?? 0,
      tone: "success",
      note: trf("{0} khớp · {1} không khớp", [formatInt(o?.matchedToday ?? 0), formatInt(o?.mismatchedToday ?? 0)]),
    },
    {
      key: "mismatch",
      label: tr("Không khớp · 30 ngày"),
      value: o?.mismatch30d ?? 0,
      tone: "warning",
      note: tr("Lần đối soát thấy tệp khác bản niêm phong"),
    },
    {
      key: "archived",
      label: tr("Hồ sơ lưu trữ"),
      value: o?.archived ?? 0,
      note: tr("Chứng từ đã kết thúc · chỉ đọc"),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Sổ cái")}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {tr("Niêm phong SHA-256 trong chuỗi hash kiểm toán · đối soát toàn vẹn và phòng đọc ảo cho hồ sơ lưu trữ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o?.chainReader && (
            <button type="button" onClick={() => void verifyChain()} className={secondaryButtonClass}>
              <Link2 className="h-4 w-4" aria-hidden />
              {tr("Kiểm tra toàn chuỗi hash")}
            </button>
          )}
          <button type="button" onClick={() => void exportReport()} className={secondaryButtonClass}>
            <Download className="h-4 w-4" aria-hidden />
            {tr("Xuất báo cáo đối soát")}
          </button>
        </div>
      </div>

      <LedgerStats items={stats} />

      <LedgerTabs value={tab} onChange={setTab} />

      {tab === "verify" ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
          <VerificationPanel
            code={code}
            onCodeChange={setCode}
            busy={busy}
            hashing={hashing}
            result={result}
            onVerifyCode={() => void verifyCode(code)}
            onVerifyFile={(f) => void verifyFile(f)}
            onCopy={() => void copyEvidence()}
            onCertificate={openCertificate}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <RecentSealsWidget
              rows={o?.recent ?? []}
              onPick={(r) => {
                const input = `${r.code} v${r.version}`;
                setCode(input);
                void verifyCode(input);
              }}
            />
            <VirtualReadingRoomWidget
              docs={archive.docs.slice(0, FEATURED)}
              onOpen={(d) => void openDoc(d)}
              onShowAll={() => setTab("reading")}
            />
          </div>
        </div>
      ) : (
        <ReadingRoomPanel
          docs={archive.docs}
          totalArchived={o?.archived ?? archive.docs.length}
          logs={archive.access}
          onOpen={(d) => void openDoc(d)}
        />
      )}

      <ReadOnlyViewerModal view={viewing} onClose={() => setViewing(undefined)} />
    </div>
  );
};

export default LedgerPage;
