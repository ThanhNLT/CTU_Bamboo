import { Droplets, EyeOff, ScrollText } from "lucide-react";
import { useState } from "react";

import { SearchInput } from "../../../components/ui";
import type { AccessLog, ArchiveDoc } from "../types";
import { filterArchive, formatInt } from "../utils";
import { ArchiveDocRow } from "./ArchiveDocRow";
import { tr } from "../../../i18n";

const RULES = [
  {
    icon: Droplets,
    title: tr("Dấu chìm tên người xem"),
    text: tr("Mỗi trang phủ tên bạn và thời điểm mở, nên ảnh chụp màn hình vẫn truy được nguồn."),
  },
  {
    icon: EyeOff,
    title: tr("Xem trong trang, link ngắn hạn"),
    text: tr("Tệp mở ngay trong trình xem; link do máy chủ cấp hết hạn sau 60 giây, mỗi lần mở cấp link mới."),
  },
  {
    icon: ScrollText,
    title: tr("Ghi nhật ký truy cập"),
    text: tr("Mọi lần mở đều được ghi lại (chỉ ghi thêm, không sửa, không xóa)."),
  },
];

export const ReadingRoomPanel = ({
  docs,
  totalArchived,
  logs,
  onOpen,
}: {
  docs: ArchiveDoc[];
  totalArchived: number;
  logs: AccessLog[];
  onOpen: (doc: ArchiveDoc) => void;
}) => {
  const [query, setQuery] = useState("");
  const visible = filterArchive(docs, query);

  return (
    <div
      id="ledger-panel-reading"
      role="tabpanel"
      aria-labelledby="ledger-tab-reading"
      className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]"
    >
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label={tr("Hồ sơ lưu trữ")}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{tr("Hồ sơ lưu trữ")}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {formatInt(totalArchived)} {tr(" tệp của chứng từ đã kết thúc · đang hiển thị ")} {visible.length}
            </p>
          </div>
        </div>
        <SearchInput
          className="mt-3"
          value={query}
          onChange={setQuery}
          placeholder={tr("Tìm theo tên, mã lưu trữ, năm")}
        />
        {visible.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">{tr("Không có hồ sơ lưu trữ phù hợp.")}</p>
        ) : (
          <div className="mt-1 divide-y divide-line">
            {visible.map((d) => (
              <ArchiveDocRow key={d.id} doc={d} detailed onOpen={() => onOpen(d)} />
            ))}
          </div>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <section
          className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          aria-label={tr("Nhật ký truy cập")}
        >
          <h2 className="text-[15px] font-semibold text-ink">{tr("Nhật ký truy cập")}</h2>
          {logs.length === 0 && <p className="py-4 text-[12.5px] text-muted">{tr("Chưa có ai mở hồ sơ lưu trữ.")}</p>}
          <ul className="m-0 mt-2 list-none divide-y divide-line p-0">
            {logs.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{l.docTitle}</span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {l.viewer} · {l.fileName}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted">{l.at}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          aria-label={tr("Quy tắc phòng đọc")}
        >
          <h2 className="text-[15px] font-semibold text-ink">{tr("Quy tắc phòng đọc")}</h2>
          <ul className="m-0 mt-3 list-none space-y-3 p-0">
            {RULES.map((r) => (
              <li key={r.title} className="flex items-start gap-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bamboo-50 text-bamboo-700"
                  aria-hidden
                >
                  <r.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink">{r.title}</span>
                  <span className="block text-[12px] text-muted">{r.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};
