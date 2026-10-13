// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { cn } from "../../../utils/cn";
import type { FieldKey, OcrField } from "../types";
import { LEVEL_STYLE, PAPER_H, PAPER_W, formatConfidence, levelOf } from "../utils";

const Label = ({ y, children }: { y: number; children: string }) => (
  <span className="absolute left-[18px] text-[9.5px] text-[#5b6660]" style={{ top: y + 2 }}>
    {children}
  </span>
);

/** Chữ trên giấy tại đúng vị trí khung nhận diện của trường. */
const Value = ({ field, className }: { field?: OcrField; className?: string }) =>
  field ? (
    <span
      className={cn(
        "absolute flex items-center overflow-hidden whitespace-nowrap px-1 text-[10px] text-[#1f2a24]",
        className,
      )}
      style={{ left: field.bbox.x, top: field.bbox.y, height: field.bbox.h, width: field.bbox.w }}
    >
      <span className="truncate">{field.raw}</span>
    </span>
  ) : null;

/**
 * Tờ "Phiếu yêu cầu bảo trì" vẽ bằng HTML/CSS (khổ 320 × 350), và lớp khung nhận diện OCR đặt tuyệt đối đè lên.
 * Màu khung theo độ tin cậy: xanh ≥ 0,8 · vàng 0,5–0,8 · đỏ < 0,5. Bấm khung để nhảy tới ô tương ứng trong form.
 */
export const MockDocumentPreview = ({
  fields,
  activeKey,
  onPick,
  showBoxes,
}: {
  fields: OcrField[];
  activeKey?: FieldKey;
  onPick: (key: FieldKey) => void;
  showBoxes: boolean;
}) => {
  const f = (k: FieldKey) => fields.find((x) => x.key === k);
  return (
    <div
      className="relative select-none rounded-md bg-white shadow-[0_8px_24px_-8px_rgb(16_24_20/0.18),0_1px_3px_rgb(16_24_20/0.08)]"
      style={{ width: PAPER_W, height: PAPER_H }}
    >
      {/* Đầu phiếu */}
      <span className="absolute left-[18px] top-[16px] text-[8px] font-medium uppercase tracking-[0.12em] text-[#5b6660]">
        Công ty Chip &amp; Linh kiện
      </span>
      <span className="absolute right-[18px] top-[16px] text-[8px] tracking-[0.08em] text-[#5b6660]">BM-BT-02</span>
      <span className="absolute left-[18px] top-[34px] text-[13px] font-bold tracking-[0.02em] text-[#1f2a24]">
        PHIẾU YÊU CẦU BẢO TRÌ
      </span>
      <span className="absolute left-[18px] top-[59px] text-[10px] text-[#5b6660]">Số:</span>
      <Value field={f("docNo")} className="font-medium" />
      <span className="absolute left-[18px] right-[18px] top-[84px] h-px bg-[#d8ddd9]" />

      <Label y={96}>Ngày lập</Label>
      <Value field={f("date")} />
      <Label y={119}>Đơn vị</Label>
      <Value field={f("unit")} />
      <Label y={142}>Thiết bị</Label>
      <Value field={f("device")} />
      <Label y={165}>Mô tả sự cố</Label>
      <Value field={f("description")} />
      <Label y={188}>Mức ưu tiên</Label>
      <Value field={f("priority")} />

      {/* Ô ghi chú để trống */}
      <span className="absolute left-[18px] right-[18px] top-[214px] h-[40px] rounded-sm border border-[#d8ddd9] bg-[#fafbfa]" />

      <Label y={270}>Người đề nghị</Label>
      {/* Chữ viết tay khó đọc: nét nghiêng + gạch lượn sóng đỏ */}
      {f("requester") && (
        <span
          className="absolute px-1 text-[12px] italic text-[#2b3a8f] underline decoration-red-500 decoration-wavy underline-offset-2"
          style={{
            left: f("requester")?.bbox.x,
            top: f("requester")?.bbox.y,
            fontFamily: '"Segoe Script", "Brush Script MT", cursive',
          }}
        >
          {f("requester")?.raw}
        </span>
      )}
      <Label y={295}>Chữ ký</Label>
      <Value field={f("signature")} />

      <span className="absolute left-[18px] top-[324px] h-1.5 w-[70%] rounded bg-[#eef1ee]" />
      <span className="absolute left-[18px] top-[334px] h-1.5 w-[45%] rounded bg-[#eef1ee]" />

      {/* Lớp khung nhận diện */}
      {showBoxes &&
        fields.map((fd) => {
          const lv = levelOf(fd.confidence);
          const active = fd.key === activeKey;
          return (
            <button
              key={fd.key}
              type="button"
              onClick={() => onPick(fd.key)}
              title={`${fd.label} · tin cậy ${formatConfidence(fd.confidence)}`}
              aria-label={`${fd.label}: tin cậy ${formatConfidence(fd.confidence)}`}
              className={cn(
                "absolute rounded-[3px] border-[1.5px] transition-shadow focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bamboo-500",
                LEVEL_STYLE[lv].box,
                active && "shadow-[0_0_0_3px_rgb(63_145_80/0.25)]",
              )}
              style={{ left: fd.bbox.x - 2, top: fd.bbox.y - 1, width: fd.bbox.w + 4, height: fd.bbox.h + 2 }}
            />
          );
        })}
    </div>
  );
};
