// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Bộ trả lời MẪU (thay cho API trợ lý chạy Qwen3 nội bộ): khớp từ khóa → câu trả lời dựng sẵn từ dữ liệu mẫu.
// Không hiểu câu hỏi thì nói thật là bản demo, không bịa. Khi nối API thật chỉ cần thay `replyTo`.

// ===== Module nội bộ =====
import { fold } from "../../utils/text";
import {
  DEFAULT_SUGGESTIONS,
  LIB_CLEANROOM_TEXT,
  OEE_CHART,
  OEE_STEPS,
  SRC_CLEANROOM_RULE,
  SRC_INCIDENT,
  SRC_OEE_DEF,
} from "./mock";
import type { AssistantMode, Citation, Reply } from "./types";

// ===== Văn bản có đánh dấu =====
export type RichPart = { type: "text"; value: string } | { type: "bold"; value: string } | { type: "cite"; id: number };

/** Tách "**đậm**" và "[1]" thành các phần để hiển thị. */
export const parseRich = (text: string): RichPart[] =>
  text
    .split(/(\*\*[^*]+\*\*|\[\d+\])/g)
    .filter(Boolean)
    .map((s): RichPart => {
      if (s.startsWith("**") && s.endsWith("**")) return { type: "bold", value: s.slice(2, -2) };
      const cite = /^\[(\d+)\]$/.exec(s);
      return cite?.[1] ? { type: "cite", id: Number(cite[1]) } : { type: "text", value: s };
    });

/** Bản thuần văn bản (để sao chép): bỏ dấu **, giữ [n] và liệt kê nguồn ở cuối. */
export const plainText = (text: string, sources: Citation[] = []) =>
  [
    text.replace(/\*\*/g, ""),
    ...(sources.length ? ["", "Nguồn:", ...sources.map((s) => `[${s.id}] ${s.label}`)] : []),
  ].join("\n");

export const totalMs = (r: Reply) => (r.steps ?? []).reduce((a, s) => a + s.ms, 0);

/** "1,9 giây" */
export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} giây`;

// ===== Ngữ cảnh từ URL (các trang khác mở trợ lý kèm tham số) =====
/** ?record=HS-… · ?entity=urn:ngsi-ld:CleanRoom:semicon:CR-02 · ?source=library · ?context=… */
export const contextFromParams = (p: URLSearchParams) => {
  const record = p.get("record");
  if (record) return `Hồ sơ ${record}`;
  const entity = p.get("entity");
  if (entity) return `Bản sao số · ${entity.split(":").pop()}`;
  if (p.get("source") === "library") return "Thư viện tri thức";
  return p.get("context") ?? undefined;
};

export const suggestionsFor = (context?: string) => {
  const c = fold(context ?? "");
  if (c.includes("cr-02") || c.includes("ban sao so")) {
    return ["Vì sao CR-02 vượt ngưỡng?", "Chênh áp CR-02 hiện thế nào?", "Ai đang xử lý sự cố CR-02?"];
  }
  if (c.includes("thu vien"))
    return ["Quy chế phòng sạch khi vượt ngưỡng", "Xử lý tràn đổ hóa chất thế nào?", "Tài liệu nào sắp hết hiệu lực?"];
  if (c.startsWith("ho so")) return ["Tóm tắt hồ sơ này", "Hồ sơ này đang chờ ai duyệt?", "Đối soát hồ sơ trên sổ cái"];
  return DEFAULT_SUGGESTIONS;
};

/** Tên phiên từ câu hỏi đầu tiên. */
export const titleFrom = (text: string) => {
  const t = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/, "");
  return t.length > 40 ? `${t.slice(0, 38)}…` : t;
};

// ===== Bộ trả lời mẫu =====
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

const OEE_REPLY: Reply = {
  text:
    "OEE dây chuyền SMT tuần 40 là **81,0%**, giảm 3,2 điểm so với tuần 39. Nguyên nhân chính là SMT-02 dừng 9 giờ " +
    "ngày 01/10 do lỗi cấp linh kiện [1]; hai dây chuyền còn lại vẫn ổn định. Dự báo tuần 41 khoảng **80–83%** " +
    "nếu SMT-02 không dừng thêm [2].",
  chart: OEE_CHART,
  steps: OEE_STEPS,
  sources: [SRC_INCIDENT, SRC_OEE_DEF],
};

export const replyTo = (question: string, opts: { mode: AssistantMode; context?: string; files?: string[] }): Reply => {
  const q = fold(question);
  const ctx = fold(opts.context ?? "");

  if (opts.files?.length) {
    return {
      text:
        `Đã nhận **${opts.files.length}** tệp (${opts.files.join(", ")}). Tệp được quét mã độc và trích xuất văn bản trên ` +
        "máy chủ nội bộ trước khi tôi đọc. Bản demo chưa xử lý nội dung tệp, nên tôi chưa trả lời dựa trên tệp được.",
      steps: [{ name: "scan_upload", args: `files=${opts.files.length}`, ms: 700 }],
    };
  }

  // Đang gắn ngữ cảnh một hồ sơ → mọi câu hỏi xoay quanh hồ sơ đó.
  const record = /hs-[a-z]+-\d{4}-\d{5}/.exec(`${ctx} ${q}`)?.[0]?.toUpperCase();
  if (record && (ctx.startsWith("ho so") || has(q, "tom tat", "doi soat"))) {
    return {
      text:
        `Bản demo chưa nối API hồ sơ nên tôi chưa đọc được nội dung **${record}**. Bạn có thể đối soát toàn vẹn của hồ sơ ` +
        "này trên Sổ cái [1].",
      steps: [{ name: "get_record", args: `code="${record}"`, ms: 300 }],
      sources: [{ id: 1, label: `Sổ cái · ${record}`, to: `/d/ledger?doc=${record}` }],
    };
  }

  if (has(q, "het hieu luc")) {
    return {
      text: "Bản demo chưa có dữ liệu ngày hết hiệu lực của tài liệu. Trong Thư viện tri thức, bạn lọc theo ngày hiệu lực để rà soát [1].",
      steps: [{ name: "search_library", args: 'filter="effective_date"', ms: 300 }],
      sources: [{ id: 1, label: "Thư viện tri thức", to: "/h/library" }],
    };
  }

  if (has(q, "hoa chat", "tran do")) {
    return {
      text:
        "Theo Quy định an toàn hóa chất trong fab (v4, hiệu lực 01/06/2026), khi tràn đổ: sơ tán bán kính **5 m**, kích hoạt " +
        "hút khí cục bộ, dùng bộ hấp thụ chuyên dụng và báo trưởng ca trong vòng **5 phút** (Điều 9) [1].",
      steps: [{ name: "search_library", args: 'query="tràn đổ hóa chất", top_k=5', ms: 400 }],
      sources: [{ id: 1, label: "Quy định an toàn hóa chất trong fab · v4", to: "/h/library" }],
    };
  }

  if (has(q, "quy che", "quy dinh", "ra vao")) {
    return {
      text: LIB_CLEANROOM_TEXT,
      steps: [{ name: "search_library", args: 'query="quy chế phòng sạch", top_k=5', ms: 500 }],
      sources: [SRC_CLEANROOM_RULE],
    };
  }

  if (has(q, "bao cao tuan")) {
    return {
      text:
        "Số liệu tuần 40 của SMT-02: OEE **77,8%** (sẵn sàng 82%, hiệu năng 96%, chất lượng 98,8%), tổng thời gian dừng " +
        "**9 giờ 20 phút**, trong đó 9 giờ do lỗi cấp linh kiện ngày 01/10 [1]. Tôi có thể tạo báo cáo tuần ở dạng nháp.",
      steps: [
        { name: "query_metric", args: 'metric="mfg.oee", line="SMT-02", week=40', ms: 400 },
        { name: "get_twin_history", args: 'entity="SMT-02", week=40', ms: 500 },
      ],
      sources: [SRC_INCIDENT, SRC_OEE_DEF],
      action: {
        title: "Trợ lý đề xuất: tạo báo cáo tuần nháp",
        recordType: "Báo cáo tuần dây chuyền",
        device: "SMT-02 · Nhà máy điện thoại",
        description: "Tuần 40: OEE 77,8%, dừng 9 giờ 20 phút (lỗi cấp linh kiện ngày 01/10).",
        note: "Chỉ tạo ở trạng thái Nháp khi bạn xác nhận · trợ lý không tự gửi duyệt.",
      },
    };
  }

  if (has(q, "cung ky", "nam truoc", "so sanh")) {
    const prev = [82.4, 83.0, 82.8, 83.5, 83.1, 82.9, 83.4, 83.6];
    return {
      text:
        "Tuần 40 năm nay OEE **81,0%**, thấp hơn cùng kỳ 2025 (**83,6%**) 2,6 điểm. Tính trung bình 8 tuần thì năm nay vẫn " +
        "cao hơn: **84,4%** so với 83,1% [1].",
      chart: {
        ...OEE_CHART,
        title: "OEE dây chuyền SMT: 2026 so với 2025 (%)",
        data: OEE_CHART.data.slice(0, 8).map((d, i) => ({ label: d.label, actual: d.actual, compare: prev[i] })),
        legend: { actual: "2026", compare: "2025" },
        method: "Cùng tuần ISO năm 2025 · nguồn mart.smt_oee_hourly",
      },
      steps: [{ name: "query_metric", args: 'metric="mfg.oee", weeks=8, compare="yoy"', ms: 600 }],
      sources: [SRC_OEE_DEF],
    };
  }

  if (has(q, "ai dang xu ly", "ai xu ly", "dang cho ai", "nguoi xu ly")) {
    if (has(q + ctx, "cr-02", "phong sach")) {
      return {
        text:
          "Sự cố CR-02 nằm trong hồ sơ **HS-SEMI-2026-00125** “Báo cáo sự cố phòng sạch CR-02”, đang chờ duyệt và còn " +
          "khoảng 3 giờ trước hạn [1].",
        steps: [{ name: "find_records", args: 'entity="CR-02", status="open"', ms: 400 }],
        sources: [{ id: 1, label: "Hộp việc · HS-SEMI-2026-00125", to: "/p/tasks" }],
      };
    }
    return {
      text:
        "Sự cố SMT-02 đang ở hồ sơ **HS-MOB-2026-00305** “Báo cáo lỗi dây chuyền SMT-02”, bước **Cấp 1**, đã quá hạn " +
        "1 giờ [1]. Người duyệt bước này là trưởng ca sản xuất của Nhà máy điện thoại theo quy trình hiện hành [2].",
      steps: [
        { name: "find_records", args: 'device="SMT-02", status="open"', ms: 400 },
        { name: "get_process", args: 'key="bao_cao_loi_day_chuyen"', ms: 300 },
      ],
      sources: [
        { id: 1, label: "Trung tâm điều hành · hồ sơ quá hạn", to: "/d/ops" },
        { id: 2, label: "Quy trình Báo cáo lỗi dây chuyền", to: "/p/process" },
      ],
    };
  }

  if (has(q + ctx, "cr-02", "phong sach", "chenh ap")) {
    return {
      text:
        "Phòng sạch CR-02 vượt ngưỡng hạt bụi ≥0,5 µm trong **18 phút** (10:12–10:29 ngày 10/10), đỉnh **3.683** hạt/m³ " +
        "so với ngưỡng ISO 5 là 3.520. Chênh áp tụt còn **8 Pa** từ 10:08 và chưa hồi về mức tối thiểu 10 Pa [1]. " +
        "Hồ sơ sự cố HS-SEMI-2026-00125 đang chờ duyệt [2]. Vì vượt quá 15 phút, theo Điều 12 Quy chế vận hành phòng sạch " +
        "trưởng ca phải lập biên bản xử lý tạm thời trong 2 giờ [3].",
      steps: [
        { name: "get_twin_history", args: 'entity="CR-02", hours=1', ms: 500 },
        { name: "find_records", args: 'entity="CR-02"', ms: 300 },
      ],
      sources: [
        { id: 1, label: "Bản sao số · CR-02", to: "/d/twin?entity=CR-02" },
        { id: 2, label: "Hộp việc · HS-SEMI-2026-00125", to: "/p/tasks" },
        { ...SRC_CLEANROOM_RULE, id: 3 },
      ],
    };
  }

  if (has(q, "oee", "hieu suat")) return OEE_REPLY;

  return {
    text:
      "Đây là bản demo với dữ liệu mẫu, nên tôi chỉ trả lời được một số câu hỏi về **OEE dây chuyền SMT**, " +
      "**phòng sạch CR-02** và **hồ sơ SMT-02**. Bạn thử một gợi ý bên dưới nhé.",
    steps: [{ name: "route_intent", args: `mode="${opts.mode}"`, ms: 200 }],
  };
};
