// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Sổ cái (Dữ liệu số): niêm phong bất biến trên Hyperledger Fabric. Tab "Đối soát" so mã hồ sơ hoặc tệp
// (băm SHA-256 ngay trong trình duyệt) với bản niêm phong; tab "Phòng đọc ảo" mở hồ sơ lưu trữ ở chế độ chỉ đọc.
// Mở thẳng một hồ sơ: /d/ledger?code=HS-SEMI-2026-00087. Dữ liệu minh họa ở ./mock.

// ===== Thư viện =====
import { App } from "antd"; // Ant Design
import { Download } from "lucide-react"; // Lucide React
import { useRef, useState } from "react"; // React
import { useSearchParams } from "react-router"; // React Router

// ===== Module nội bộ =====
import { useSession } from "../../auth/useSession";
import { secondaryButtonClass } from "../../components/ui";
import { copyText } from "../../utils/clipboard";
import { LedgerStats, type LedgerStat } from "./components/LedgerStats";
import { LedgerTabs } from "./components/LedgerTabs";
import { ReadingRoomPanel } from "./components/ReadingRoomPanel";
import { ReadOnlyViewerModal } from "./components/ReadOnlyViewerModal";
import { RecentSealsWidget } from "./components/RecentSealsWidget";
import { VerificationPanel } from "./components/VerificationPanel";
import { VirtualReadingRoomWidget } from "./components/VirtualReadingRoomWidget";
import {
  ACCESS_LOGS,
  ARCHIVE_DOCS,
  DEFAULT_CODE,
  FEATURED_ARCHIVE_IDS,
  RECENT_SEALS,
  SAMPLE_FILE,
  SEALS,
  STATS,
} from "./mock";
import type { AccessLog, ArchiveDoc, LedgerTab, SealLogRow, VerifyResult } from "./types";
import {
  MAX_FILE_BYTES,
  certificateHtml,
  downloadText,
  evidenceText,
  formatInt,
  formatStamp,
  reconciliationCsv,
  sha256Hex,
  verifyByCode,
  verifyByHash,
} from "./utils";

// ===== Hằng số =====
/** Độ trễ giả lập một lần truy vấn sổ cái (để thấy trạng thái "Đang đối soát…"). */
const QUERY_DELAY_MS = 500;
const FEATURED = ARCHIVE_DOCS.filter((d) => FEATURED_ARCHIVE_IDS.includes(d.id));

// ===== Component =====
export const LedgerPage = () => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [params] = useSearchParams();

  const [tab, setTab] = useState<LedgerTab>("verify");
  const [code, setCode] = useState(() => params.get("code") ?? DEFAULT_CODE);
  // Mở trang là có sẵn kết quả của mã mặc định (như thiết kế).
  const [result, setResult] = useState<VerifyResult | undefined>(() =>
    verifyByCode(SEALS, params.get("code") ?? DEFAULT_CODE, formatStamp(new Date())),
  );
  const [busy, setBusy] = useState(false);
  const [hashing, setHashing] = useState<{ name: string; size: number }>();
  const [log, setLog] = useState<SealLogRow[]>(RECENT_SEALS);
  const [session, setSession] = useState({ verified: 0, matched: 0, mismatched: 0 });
  const [viewing, setViewing] = useState<{ doc: ArchiveDoc; at: string }>();
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>(ACCESS_LOGS);
  const runId = useRef(0);

  /** Ghi kết quả: cập nhật số liệu hôm nay và cột "Kết quả" của dòng tương ứng. */
  const record = (r: VerifyResult) => {
    setResult(r);
    setSession((s) => ({
      verified: s.verified + 1,
      matched: s.matched + (r.kind === "match" ? 1 : 0),
      mismatched: s.mismatched + (r.kind === "mismatch" ? 1 : 0),
    }));
    if (r.kind !== "not_found") {
      const time = r.checkedAt.slice(-5);
      const key = `${r.seal.code}#${r.seal.version}`;
      setLog((rows) => {
        const row: SealLogRow = {
          code: r.seal.code,
          version: r.seal.version,
          time,
          result: r.kind === "match" ? "match" : "mismatch",
        };
        const exists = rows.some((x) => `${x.code}#${x.version}` === key);
        return exists ? rows.map((x) => (`${x.code}#${x.version}` === key ? { ...x, result: row.result } : x)) : rows;
      });
    }
  };

  const verifyCode = (input = code) => {
    const id = ++runId.current;
    setBusy(true);
    window.setTimeout(() => {
      if (id !== runId.current) return;
      setBusy(false);
      record(verifyByCode(SEALS, input, formatStamp(new Date())));
    }, QUERY_DELAY_MS);
  };

  const verifyFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      message.error("Tệp lớn hơn 200 MB — hãy đối soát theo mã hồ sơ.");
      return;
    }
    const id = ++runId.current;
    setHashing({ name: file.name, size: file.size });
    try {
      const hash = await sha256Hex(file);
      if (id !== runId.current) return;
      record(verifyByHash(SEALS, hash, file.name, formatStamp(new Date())));
    } catch {
      if (id === runId.current) message.error("Không đọc được tệp. Thử lại hoặc chọn tệp khác.");
    } finally {
      if (id === runId.current) setHashing(undefined);
    }
  };

  const copyEvidence = async () => {
    if (!result) return;
    const ok = await copyText(evidenceText(result));
    if (ok) message.success("Đã sao chép bằng chứng đối soát.");
    else message.error("Không sao chép được. Trình duyệt chặn bộ nhớ tạm.");
  };

  const openCertificate = () => {
    if (!result || result.kind === "not_found") return;
    const w = window.open("", "_blank");
    if (!w) {
      message.error("Trình duyệt chặn cửa sổ mới. Cho phép cửa sổ bật lên rồi thử lại.");
      return;
    }
    w.document.open();
    w.document.write(certificateHtml(result));
    w.document.close();
    message.info("Trong hộp thoại In, chọn “Lưu dưới dạng PDF”.");
  };

  const exportReport = () => {
    const day = formatStamp(new Date()).slice(0, 10).split("/").reverse().join("-");
    downloadText(reconciliationCsv(SEALS, log), `doi-soat-so-cai-${day}.csv`, "text/csv;charset=utf-8");
    message.success(`Đã xuất báo cáo đối soát (${SEALS.length} bản niêm phong).`);
  };

  const openDoc = (doc: ArchiveDoc) => {
    const at = formatStamp(new Date());
    setViewing({ doc, at });
    setAccessLogs((l) => [{ id: `al-${Date.now()}`, docTitle: doc.title, viewer: tenant.full_name, at }, ...l]);
  };

  const stats: LedgerStat[] = [
    {
      key: "sealed",
      label: "Đã niêm phong",
      value: STATS.sealed,
      note: `+${formatInt(STATS.sealedThisWeek)} tuần này`,
    },
    {
      key: "today",
      label: "Xác minh hôm nay",
      value: STATS.verifiedToday + session.verified,
      tone: "success",
      note:
        `${formatInt(STATS.matchedToday + session.matched)} khớp · ${STATS.pendingToday} đang chờ` +
        (session.verified - session.matched - session.mismatched > 0
          ? ` · ${session.verified - session.matched - session.mismatched} chưa niêm phong`
          : ""),
    },
    {
      key: "mismatch",
      label: "Không khớp · 30 ngày",
      value: STATS.mismatch30d,
      tone: "warning",
      note: "Đã xử lý, có biên bản",
    },
    { key: "archived", label: "Hồ sơ lưu trữ", value: STATS.archived, note: "Lạnh · chỉ đọc" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Sổ cái</h1>
          <p className="mt-1 text-[13px] text-muted">
            Niêm phong bất biến trên Hyperledger Fabric · đối soát toàn vẹn và phòng đọc ảo cho hồ sơ lưu trữ
          </p>
        </div>
        <button type="button" onClick={exportReport} className={secondaryButtonClass}>
          <Download className="h-4 w-4" aria-hidden />
          Xuất báo cáo đối soát
        </button>
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
            onVerifyCode={() => verifyCode()}
            onVerifyFile={(f) => void verifyFile(f)}
            onSampleDownload={() => downloadText(SAMPLE_FILE.content, SAMPLE_FILE.name, "text/plain;charset=utf-8")}
            onCopy={() => void copyEvidence()}
            onCertificate={openCertificate}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <RecentSealsWidget
              rows={log}
              onPick={(r) => {
                const input = `${r.code} v${r.version}`;
                setCode(input);
                verifyCode(input);
              }}
            />
            <VirtualReadingRoomWidget docs={FEATURED} onOpen={openDoc} onShowAll={() => setTab("reading")} />
          </div>
        </div>
      ) : (
        <ReadingRoomPanel docs={ARCHIVE_DOCS} totalArchived={STATS.archived} logs={accessLogs} onOpen={openDoc} />
      )}

      <ReadOnlyViewerModal
        doc={viewing?.doc}
        viewer={tenant.full_name}
        openedAt={viewing?.at ?? ""}
        onClose={() => setViewing(undefined)}
      />
    </div>
  );
};

export default LedgerPage;
