// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thư viện tri thức (ADR #48): chuyên viên đề xuất tài liệu (nháp → đính kèm tệp → gửi duyệt), trưởng phòng duyệt
// trong Hộp việc, tài liệu xuất bản vào thư viện; người ở công ty khác đọc được tài liệu phạm vi tập đoàn và tìm
// thấy qua nội dung tệp (tìm toàn văn).

// ===== Thư viện =====
import { expect, test, type Page } from "@playwright/test"; // Playwright

// ===== Hằng số =====
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const STAMP = Date.now().toString(36);
const TITLE = `Hướng dẫn E2E ${STAMP}`;
// Từ chỉ có trong nội dung tệp: tìm thấy nghĩa là tệp đã qua Tika vào chỉ mục.
const SECRET_WORD = `kimchinam${STAMP}`;

// ===== Hàm tiện ích =====
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

async function logout(page: Page) {
  const loggedOut = page.waitForResponse((r) => r.url().includes("/protocol/openid-connect/logout"));
  await page
    .locator("header")
    .getByRole("button", { name: /^Tài khoản:/ })
    .click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await loggedOut;
  await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();
}

// ===== Kịch bản kiểm thử =====
test("đề xuất tài liệu, duyệt, xuất bản và tìm toàn văn trong thư viện", async ({ page }) => {
  test.setTimeout(180_000);

  // Chuyên viên mua hàng: lập nháp, đính kèm tệp, gửi duyệt.
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/h/library");
  await page.getByRole("button", { name: "Đề xuất tài liệu" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Tên tài liệu").fill(TITLE);
  await form.getByRole("combobox", { name: "Loại" }).click({ force: true });
  await page.locator(".ant-select-item-option", { hasText: "Hướng dẫn" }).first().click();
  await form.getByLabel("Cả tập đoàn").check();
  await form.getByLabel("Tóm tắt").fill("Hướng dẫn thử nghiệm tự động.");
  await form.getByLabel("Mục lục").fill("Chuẩn bị\nThực hiện");
  await form.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp. Đính kèm tệp rồi gửi duyệt.")).toBeVisible();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  const url = page.url();

  await page.locator('input[type="file"]').setInputFiles({
    name: "huong-dan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Hướng dẫn nội bộ. Mã tra cứu ${SECRET_WORD}.\n`),
  });
  await expect(page.getByText("Sạch")).toBeVisible();
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await expect(page.getByText("Chờ duyệt").first()).toBeVisible();
  await logout(page);

  // Trưởng phòng Mua hàng: việc nằm trong Hộp việc, duyệt trên trang đề xuất.
  await login(page, "tp.muahang.dienthoai");
  await page.goto("/p/tasks");
  await expect(page.getByText(`Đề xuất tài liệu: ${TITLE}`).first()).toBeVisible();
  await page.goto(url);
  await page.getByRole("button", { name: "Xử lý duyệt" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã xuất bản").first()).toBeVisible();
  await logout(page);

  // Người ở công ty khác (Chip X) đọc được tài liệu phạm vi tập đoàn và tìm thấy qua nội dung tệp.
  await login(page, "kd.chip");
  await page.goto("/h/library");
  await expect(page.getByText(TITLE).first()).toBeVisible();
  const search = page.getByPlaceholder(/Tìm/).first();
  await search.fill(SECRET_WORD);
  // Tệp vào chỉ mục bất đồng bộ (search-sync + Tika): thử lại tới khi khớp.
  await expect(async () => {
    await search.fill("");
    await search.fill(SECRET_WORD);
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
});
