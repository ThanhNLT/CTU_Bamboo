import type { DocCategory, ScopeFilter } from "./types";
import { tr, trs } from "../../i18n";

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  regulation: tr("Quy chế"),
  sop: tr("Quy trình chuẩn (SOP)"),
  guide: tr("Hướng dẫn"),
  faq: tr("Hỏi đáp"),
};

export const CATEGORY_SHORT: Record<DocCategory, string> = {
  regulation: tr("Quy chế"),
  sop: tr("Quy trình chuẩn"),
  guide: tr("Hướng dẫn"),
  faq: tr("Hỏi đáp"),
};

export const SCOPE_OPTIONS: Array<{ label: string; value: ScopeFilter }> = [
  { label: tr("Tất cả"), value: "all" },
  { label: tr("Tập đoàn"), value: "group" },
  { label: tr("Công ty của tôi"), value: "company" },
];

export const SCOPE_LABEL = { group: tr("Cả tập đoàn"), company: tr("Trong công ty ban hành") } as const;

export const PROPOSAL_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: tr("Nháp"), color: "default" },
  PENDING: { label: tr("Chờ duyệt"), color: "processing" },
  RETURNED: { label: tr("Bị trả về"), color: "warning" },
  APPROVED: { label: tr("Đã xuất bản"), color: "success" },
  REJECTED: { label: trs("Từ chối"), color: "error" },
  CANCELLED: { label: tr("Đã hủy"), color: "default" },
  RETIRED: { label: tr("Ngừng hiệu lực"), color: "default" },
};
