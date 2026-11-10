import type { Tone } from "../../../components/ui";
import type { IndexState } from "../types";
import { tr } from "../../../i18n";

export const VIEW: Record<IndexState["status"], { label: string; tone: Tone; text: string }> = {
  indexed: { label: tr("Đã vào chỉ mục"), tone: "success", text: "text-body" },
  indexing: { label: tr("Đang cập nhật chỉ mục"), tone: "warning", text: "text-amber-700" },
  missing: { label: tr("Chưa vào chỉ mục"), tone: "warning", text: "text-amber-700" },
  error: { label: tr("Lỗi chỉ mục"), tone: "danger", text: "text-red-700" },
};

export const indexTone = (s: IndexState) => VIEW[s.status].tone;
