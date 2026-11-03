// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
// PNG hợp lệ 1×1 để qua bước quét an toàn
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const item = (
  n: number,
  description: string,
  uom: string,
  quantity: string,
  unit_price: string,
  amount: string,
  code: string | null,
) => ({
  line_no: n,
  description,
  uom,
  quantity,
  unit_price,
  amount,
  item_code: code,
  note: code ? `Mã ${code}` : null,
  consistent: true,
  confidence: 0.9,
  source: "",
});

const field = (value: string, confidence = 0.9) => ({ value, confidence, source: null });

// Dịch vụ OCR cần mô hình nặng nên không chạy trong E2E: giả lập kết quả của bước đọc chữ, còn lại (tạo đề nghị nháp,
// tải lên, quét an toàn, điền và lưu) chạy thật.
const READY = {
  ocr_document: {
    attachment_id: "00000000-0000-0000-0000-000000000000",
    file_name: "bao-gia.png",
    scan_status: "CLEAN",
    phase: "READY",
    message: null,
    ocr: { pages_total: 1, pages_done: 1, note: null, error: null },
    text: "BẢNG BÁO GIÁ\nCÔNG TY TNHH E2E",
    parsed: {
      doc_type: field("QUOTE"),
      doc_no: field("BG-E2E-01"),
      date: field("2026-10-21"),
      supplier_name: field("CÔNG TY TNHH NHÀ CUNG CẤP OCR"),
      supplier_tax_code: field("0109998887"),
      supplier_address: field("1 Đường Thử, Hà Nội", 0.7),
      items: [
        item(1, "Chip nguồn thử OCR", "cái", "1000", "12000", "12000000", "LK-OCR"),
        item(2, "Vận chuyển thử OCR", "chuyến", "1", "500000", "500000", null),
      ],
      net_amount: field("12500000"),
      vat: { rate: 10, amount: "1250000", confidence: 0.85 },
      total_amount: field("13750000"),
      warnings: [],
    },
    partner: null,
    item_matches: [null, null],
    doc_label: "Báo giá",
  },
};

test("tải bản quét, kiểm tra các trường OCR rút ra và điền vào đề nghị mua sắm nháp", async ({ page }) => {
  await page.route("**/v1/graphql", async (route) => {
    const body = route.request().postDataJSON() as { query?: string } | undefined;
    if (body?.query?.includes("ocr_document(")) {
      await route.fulfill({ json: { data: READY } });
      return;
    }
    await route.continue();
  });

  await page.goto("/login");
  await page.locator("#username").fill("nv.muahang.dienthoai");
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.locator("header").first()).toBeVisible();

  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Nhập liệu OCR").click();
  await expect(page.getByRole("heading", { name: "Nhập liệu OCR" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "bao-gia.png", mimeType: "image/png", buffer: PNG });

  const fields = page.getByRole("region", { name: "Trường đã rút" });
  await expect(fields.getByText("Báo giá")).toBeVisible({ timeout: 60_000 });
  await expect(fields.getByLabel("Tiêu đề đề nghị")).toHaveValue(/Báo giá BG-E2E-01 – CÔNG TY TNHH NHÀ CUNG CẤP OCR/);
  await expect(fields.getByLabel("Mã số thuế nhà cung cấp mới")).toHaveValue("0109998887");
  await expect(fields.getByLabel("Mô tả dòng 1")).toHaveValue("Chip nguồn thử OCR");
  await expect(fields.getByText("Tổng các dòng:")).toContainText("12.500.000");

  await fields.getByLabel("Số lượng dòng 1").fill("1200");
  await expect(fields.getByText("Tổng các dòng:")).toContainText("14.900.000");
  await expect(fields.getByText("Tổng các dòng khác cộng tiền hàng")).toBeVisible();
  await fields.getByLabel("Số lượng dòng 1").fill("1000");

  await page.getByRole("button", { name: "Điền vào đề nghị và mở" }).click();
  await expect(page).toHaveURL(/\/p\/documents\/show\//);
  await expect(page.getByText("Chip nguồn thử OCR").first()).toBeVisible();
  await expect(page.getByText("CÔNG TY TNHH NHÀ CUNG CẤP OCR").first()).toBeVisible();
});
